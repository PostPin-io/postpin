import { BETTER_AUTH_URL } from "$app/env/private";
import { sendEmail } from "./email";
import { INVITATION_TTL_MS } from "#lib/invite-target.ts";
import { invitationEmail } from "./emails/templates.ts";

// Lives next to the invite targets, so the invite dialog can name it too
export { INVITATION_TTL_MS };

export async function sendInvitationEmail(
	inv: { id: string; email: string },
	orgName: string,
	inviterName: string,
) {
	await sendEmail(
		inv.email,
		invitationEmail({
			appUrl: BETTER_AUTH_URL,
			url: `${BETTER_AUTH_URL}/auth/invite/${inv.id}`,
			email: inv.email,
			orgName,
			inviterName,
			validForMs: INVITATION_TTL_MS,
		}),
	);
}
