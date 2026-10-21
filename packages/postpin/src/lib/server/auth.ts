import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./database"; // your prisma client instance
import { sendEmail } from "./email";
import { organization } from "better-auth/plugins";
import { BETTER_AUTH_URL } from "$app/env/private";
import { ac, roles } from "#lib/roles.ts";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { createAuthMiddleware, getIP } from "better-auth/api";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql", // or "mysql", "sqlite", ...etc
	}),
	plugins: [
		organization({
			ac,
			roles,
			async sendInvitationEmail(data) {
				const inviteLink = `${BETTER_AUTH_URL}/auth/invite/${data.id}`;
				await sendEmail(
					data.email,
					`You're invited to join ${data.organization.name}`,
					`You have been invited to join the organization ${data.organization.name} by ${data.inviter.user.name}. Use this link to accept the invitation: ${inviteLink}`,
				);
			},
		}),
		deviceAuthorization({
			verificationUri: `${BETTER_AUTH_URL}/auth/device`,
			validateClient: (clientId) => Object.hasOwn(DEVICE_CLIENTS, clientId),
		}),
		bearer(),
	],
	hooks: {
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
