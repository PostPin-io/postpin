import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./database"; // your prisma client instance
import { sendEmail } from "./email";
import { organization } from "better-auth/plugins";
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from "$app/env/private";
import { building } from "$app/env";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { prepareAccountDeletion } from "#lib/server/account-deletion.ts";
import { Role } from "@postpin-io/shared/db";
import { ac, betterAuthRoles } from "#lib/better-auth-roles.ts";

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
	],
	hooks: {
		// better-auth deletes without a password while the session is younger than a day. That would
		// let anyone at an unlocked browser, or any desktop/plugin token, delete the account.
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/delete-user" && !ctx.body?.password) {
				throw new APIError("BAD_REQUEST", {
					message: "Enter your password to delete your account.",
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
					"Your PostPin account was deleted",
					"Your PostPin account and all its sessions have been deleted. Markers and comments you wrote stay with their organizations and show as “Deleted User”.",
				).catch((err: unknown) => console.error("Account deletion mail failed", err));
			},
		},
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail(
				user.email,
				"Verify your email address",
				`Use this link to verify your email address: ${url}`,
			);
		},
	},
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail(
				user.email,
				"Reset your password",
				`Use this link to reset your password: ${url}`,
			);
		},
	},
});
