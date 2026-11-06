import { auth } from "#lib/server/auth.ts";
import { prisma } from "#lib/server/database.ts";
import { joinWithAccess } from "#lib/server/grants.ts";
import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
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
		role: valid ? invitation.role : null,
		organizationName: valid ? invitation.organization.name : null,
		currentUserEmail: getRequestEvent().locals.user?.email ?? null,
	};
});

/** Joins the org (existing members keep their role) and grants the invitation's project/timeline. */
export const acceptInvitation = command(v.string(), async (id) => {
	const { locals, request } = getRequestEvent();
	const user = locals.user;
	if (!user) error(401, "Not signed in");

	const organizationId = await prisma.$transaction(async (tx) => {
		const inv = await tx.invitation.findUnique({ where: { id } });
		if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) {
			error(404, "This invitation is no longer valid");
		}
		if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
			error(403, "This invitation was sent to another e-mail address");
		}

		// Claim it first, so a double click can't accept twice
		const claimed = await tx.invitation.updateMany({
			where: { id, status: "pending" },
			data: { status: "accepted" },
		});
		if (claimed.count !== 1) error(409, "This invitation was already used");

		await joinWithAccess(tx, {
			organizationId: inv.organizationId,
			userId: user.id,
			role: inv.role,
			projectId: inv.projectId,
			timelineId: inv.timelineId,
			createdById: inv.inviterId,
		});
		return inv.organizationId;
	});

	await auth.api.setActiveOrganization({ headers: request.headers, body: { organizationId } });
	return { organizationId };
});
