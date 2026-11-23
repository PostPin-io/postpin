import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./database";
import { sendEmail } from "./email";
import { accountDeletedEmail, resetPasswordEmail, verifyEmailEmail } from "./emails/templates.ts";
import { organization } from "better-auth/plugins";
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from "$app/env/private";
import { DISABLE_PASSWORD_LOGIN } from "$app/env/public";
import { building } from "$app/env";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { prepareAccountDeletion } from "#lib/server/account-deletion.ts";
import { Role } from "@postpin-io/shared/db";
import { ac, betterAuthRoles } from "#lib/better-auth-roles.ts";
import { getSessionFromCtx } from "better-auth/api";
import { PLUGIN_SIGN_IN_DENIED } from "#lib/roles.ts";
import { userMayUsePlugins } from "#lib/server/plugin-access.ts";
import { twoFactor, genericOAuth } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { oidcProvider, socialProviders } from "#lib/server/auth-providers.ts";

const oidc = oidcProvider();
const social = socialProviders();

/** How recent a sign-in must be to delete an account that has no password to confirm with */
export const DELETE_WITHOUT_PASSWORD_MAX_AGE_MS = 10 * 60 * 1000;

// better-auth's defaults, set here so the mails can name them
const VERIFY_EMAIL_TTL_S = 60 * 60;
const RESET_PASSWORD_TTL_S = 60 * 60;

export const auth = betterAuth({
	// The build imports this module without env (see env.ts), and better-auth refuses to start
	// without a secret. The placeholder never signs anything: at runtime env.ts requires the real one.
	secret: building ? "build-only-placeholder-never-used-at-runtime" : BETTER_AUTH_SECRET,
	// Org writes go through our own commands (roles.ts + authorize): better-auth's access control
	// knows neither reviewers, grants nor invite targets. Only HTTP is blocked, auth.api.* still works.
	disabledPaths: [
		"/organization/update-member-role",
		"/organization/invite-member",
		"/organization/cancel-invitation",
		"/organization/accept-invitation",
		"/organization/update",
		"/organization/leave",
		"/organization/remove-member",
		"/organization/delete",
		// reads that bypass the filtered member list in getOrg
		"/organization/list-members",
		"/organization/get-full-organization",
		"/organization/list-invitations",
	],
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	plugins: [
		organization({
			creatorRole: Role.OWNER,
			ac,
			roles: betterAuthRoles,
		}),
		deviceAuthorization({
			verificationUri: `${BETTER_AUTH_URL}/auth/device`,
			validateClient: (clientId) => Object.hasOwn(DEVICE_CLIENTS, clientId),
		}),
		bearer(),
		twoFactor({ issuer: "PostPin" }),
		passkey({ rpName: "PostPin" }), // rpID + origin come from BETTER_AUTH_URL
		...(oidc ? [genericOAuth({ config: [oidc] })] : []),
	],
	socialProviders: social,
	trustedOrigins: social.apple ? ["https://appleid.apple.com"] : [],
	account: {
		encryptOAuthTokens: true,
		accountLinking: { enabled: true },
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			// Every device client is a plugin: a reviewer-only account may not sign one in (roles.ts)
			if (ctx.path === "/device/approve") {
				const session = await getSessionFromCtx(ctx);
				if (session && !(await userMayUsePlugins(session.user.id))) {
					throw new APIError("FORBIDDEN", { message: PLUGIN_SIGN_IN_DENIED });
				}
				return;
			}
			if (ctx.path !== "/delete-user" || ctx.body?.password) return;

			// Not getSessionFromCtx: user hooks run before bearer()'s, so a desktop/plugin token
			// isn't a session yet here. getSession() runs the whole pipeline, bearer included.
			const current = ctx.headers ? await auth.api.getSession({ headers: ctx.headers }) : null;
			if (!current) {
				throw new APIError("UNAUTHORIZED", { message: "Sign in again to delete your account." });
			}
			const hasPassword = await prisma.account.count({
				where: { userId: current.user.id, providerId: "credential" },
			});
			if (hasPassword) {
				throw new APIError("BAD_REQUEST", {
					message: "Enter your password to delete your account.",
				});
			}

			const session = await prisma.session.findUnique({
				where: { id: current.session.id },
				select: { createdAt: true, clientId: true },
			});
			const recent =
				!!session &&
				!session.clientId &&
				Date.now() - session.createdAt.getTime() < DELETE_WITHOUT_PASSWORD_MAX_AGE_MS;
			if (!recent) {
				throw new APIError("BAD_REQUEST", {
					message: "Sign in again to delete your account.",
				});
			}
		}),
		after: createAuthMiddleware(async (ctx) => {
			const deviceName = ctx.headers?.get("x-device-name")?.trim().slice(0, 100) || null;

			if (ctx.path === "/device/code") {
				const userCode = (ctx.context.returned as { user_code?: string } | undefined)?.user_code;
				if (!deviceName || !userCode) return;
				await prisma.deviceCode.update({ where: { userCode }, data: { deviceName } });
			}

			if (ctx.path === "/device/token") {
				const session = ctx.context.newSession?.session;
				if (!session) return;
				await prisma.session.update({
					where: { id: session.id },
					data: {
						clientId: ctx.body?.client_id,
						deviceName,
						ipAddress: ctx.headers ? getIP(ctx.headers, ctx.context.options) : null,
					},
				});
			}
		}),
	},
	user: {
		changeEmail: {
			enabled: true,
			updateEmailWithoutVerification: true,
		},
		deleteUser: {
			enabled: true,
			// throws if the user is the last owner somewhere; tidies up what SetNull doesn't
			beforeDelete: (user) => prepareAccountDeletion(user),
			// the account is gone at this point; a failed mail must not turn that into an error
			afterDelete: async (user) => {
				await sendEmail(
					user.email,
					accountDeletedEmail({ appUrl: BETTER_AUTH_URL, name: user.name }),
				).catch((err: unknown) => console.error("Account deletion mail failed", err));
			},
		},
	},
	emailVerification: {
		expiresIn: VERIFY_EMAIL_TTL_S,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail(
				user.email,
				verifyEmailEmail({
					appUrl: BETTER_AUTH_URL,
					url,
					name: user.name,
					email: user.email,
					validForMs: VERIFY_EMAIL_TTL_S * 1000,
				}),
			);
		},
	},
	emailAndPassword: {
		// SSO-only instances; also blocks sign-up and password reset
		enabled: !DISABLE_PASSWORD_LOGIN,
		resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_S,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail(
				user.email,
				resetPasswordEmail({
					appUrl: BETTER_AUTH_URL,
					url,
					name: user.name,
					email: user.email,
					validForMs: RESET_PASSWORD_TTL_S * 1000,
				}),
			);
		},
	},
});
