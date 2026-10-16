import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, query } from "$app/server";
import * as v from "valibot";

/** Public: what the invite page needs to show before (and after) signing in. */
export const getInvitationPreview = query(v.string(), async (id) => {
	const invitation = await prisma.invitation.findUnique({
		where: { id },
		include: { organization: { select: { name: true } } },
	});
	const valid =
		!!invitation && invitation.status === "pending" && invitation.expiresAt > new Date();

	return {
		valid,
		email: valid ? invitation.email : null,
		role: valid ? (invitation.role ?? "member") : null,
		organizationName: valid ? invitation.organization.name : null,
		currentUserEmail: getRequestEvent().locals.user?.email ?? null,
	};
});
