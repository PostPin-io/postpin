import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./database"; // your prisma client instance
import { sendEmail } from "./email";
import { organization } from "better-auth/plugins";
import { BETTER_AUTH_URL } from "$app/env/private";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql", // or "mysql", "sqlite", ...etc
	}),
	plugins: [
		organization({
			async sendInvitationEmail(data) {
				const inviteLink = `${BETTER_AUTH_URL}/auth/invite/${data.id}`;
				await sendEmail(
					data.email,
					`You're invited to join ${data.organization.name}`,
					`You have been invited to join the organization ${data.organization.name} by ${data.inviter.user.name}. Use this link to accept the invitation: ${inviteLink}`,
				);
			},
		}),
	],
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
