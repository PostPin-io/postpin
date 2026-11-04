import { canInviteAs, INVITE_ROLES, ORG_ROLES } from "#lib/roles.ts";
import { prisma } from "#lib/server/database.ts";
import { authorize } from "#lib/server/org-access.ts";
import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

export const getOrg = query(v.string(), async (slug) => {
	const org = await prisma.organization.findUnique({
		where: { slug },
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
				},
			},
			invitations: true,
		},
	});

	if (!org) error(404, "Organization not found");

	const { member } = await authorize("organization", "updateSettings", {
		type: "organization",
		id: org.id,
	});

	return {
		...org,
		myRole: member.role,
	};
});

export const changeInvitationRole = command(
	v.object({
		invitationId: v.string(),
		role: v.picklist(ORG_ROLES),
	}),
	async ({ invitationId, role }) => {
		const invitation = await prisma.invitation.findUnique({
			where: { id: invitationId },
		});
		if (!invitation) error(404, "Invitation not found");
		const { member: me } = await authorize("organization", "updateSettings", {
			type: "organization",
			id: invitation.organizationId,
		});
		if (!canInviteAs(me.role, role)) error(403, "You cannot invite someone with a higher role");
		if (invitation.status != "pending") error(400, "Invitation is not pending");
		return await prisma.invitation.update({
			where: { id: invitationId },
			data: { role },
		});
	},
);

const linkRole = v.picklist(INVITE_ROLES);
const newToken = () => randomBytes(24).toString("base64url");

export const getInviteLinks = query(v.string(), async (organizationId) => {
	await authorize("inviteLink", "read", { type: "organization", id: organizationId });
	const links = await prisma.inviteLink.findMany({
		where: { organizationId, projectId: null, timelineId: null },
	});
	return linkRole.options.map((role) => {
		const link = links.find((l) => l.role === role);
		return { role, token: link?.token ?? null, enabled: link?.enabled ?? false };
	});
});

export const setInviteLinkEnabled = command(
	v.object({ organizationId: v.string(), role: linkRole, enabled: v.boolean() }),
	async ({ organizationId, role, enabled }) => {
		const { user, member } = await authorize("inviteLink", "create", {
			type: "organization",
			id: organizationId,
		});
		if (!canInviteAs(member.role, role)) error(403, "You cannot create links for a higher role");
		// Org-level links have null project/timeline, which a compound unique cannot match
		const existing = await prisma.inviteLink.findFirst({
			where: { organizationId, role, projectId: null, timelineId: null },
		});
		if (existing) {
			await prisma.inviteLink.update({ where: { id: existing.id }, data: { enabled } });
		} else {
			await prisma.inviteLink.create({
				data: { organizationId, role, enabled, token: newToken(), createdById: user.id },
			});
		}
		await getInviteLinks(organizationId).refresh();
	},
);

export const resetInviteLink = command(
	v.object({ organizationId: v.string(), role: linkRole }),
	async ({ organizationId, role }) => {
		const { member } = await authorize("inviteLink", "create", {
			type: "organization",
			id: organizationId,
		});
		if (!canInviteAs(member.role, role)) error(403, "You cannot reset links for a higher role");
		const { count } = await prisma.inviteLink.updateMany({
			where: { organizationId, role, projectId: null, timelineId: null },
			data: { token: newToken() },
		});
		if (count === 0) error(404, "Invite link not found");
		await getInviteLinks(organizationId).refresh();
	},
);
