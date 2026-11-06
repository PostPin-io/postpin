import { auth } from "#lib/server/auth.ts";
import { prisma } from "#lib/server/database.ts";
import { joinWithAccess } from "#lib/server/grants.ts";
import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

async function findEnabledLink(token: string) {
	return prisma.inviteLink.findFirst({
		where: { token, enabled: true },
		include: { organization: { select: { id: true, name: true } } },
	});
}

/** Public: lets the join page show the org before the visitor signs in. */
export const getInviteLinkInfo = query(v.string(), async (token) => {
	const link = await findEnabledLink(token);
	const user = getRequestEvent().locals.user;
	return {
		valid: !!link,
		organizationName: link?.organization.name ?? null,
		role: link?.role ?? null,
		signedIn: !!user,
		alreadyMember:
			!!link && !!user?.memberships.some((m) => m.organizationId === link.organizationId),
	};
});

export const joinViaLink = command(v.string(), async (token) => {
	const { locals, request } = getRequestEvent();
	const signedInUser = locals.user;
	if (!signedInUser) error(401, "Not signed in");

	const link = await findEnabledLink(token);
	if (!link) error(404, "This invite link is no longer valid");

	// Existing members keep their role, but a project/timeline link still grants access
	await prisma.$transaction((tx) =>
		joinWithAccess(tx, {
			organizationId: link.organizationId,
			userId: signedInUser.id,
			role: link.role,
			projectId: link.projectId,
			timelineId: link.timelineId,
			createdById: link.createdById,
		}),
	);

	await auth.api.setActiveOrganization({
		headers: request.headers,
		body: { organizationId: link.organizationId },
	});
});
