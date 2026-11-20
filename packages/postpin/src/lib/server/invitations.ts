import { BETTER_AUTH_URL } from "$app/env/private";
import { sendEmail } from "./email";

// Lives next to the invite targets, so the invite dialog can name it too
export { INVITATION_TTL_MS } from "#lib/invite-target.ts";

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
