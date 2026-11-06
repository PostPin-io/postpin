import { BETTER_AUTH_URL } from "$app/env/private";
import { sendEmail } from "./email";

export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function sendInvitationEmail(
	inv: { id: string; email: string },
	orgName: string,
	inviterName: string,
) {
	const link = `${BETTER_AUTH_URL}/auth/invite/${inv.id}`;
	await sendEmail(
		inv.email,
		`You're invited to join ${orgName}`,
		`You have been invited to join the organization ${orgName} by ${inviterName}. Use this link to accept the invitation: ${link}`,
	);
}
