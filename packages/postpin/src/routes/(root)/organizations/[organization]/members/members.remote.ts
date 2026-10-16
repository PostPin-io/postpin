import { prisma } from "#lib/server/database.ts";
import { requireOrgRole } from "#lib/server/org-access.ts";
import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

export const getOrg = query(v.string(), async (slug) => {
	const org = await prisma.organization.findUnique({
		where: { slug },
		include: {
			members: {
				include: {
					user: { select: { id: true, name: true, email: true } },
				},
			},
			invitations: true,
		},
	});
	if (!org) error(404, "Organization not found");
	const me = await requireOrgRole(org.id, ["owner", "admin", "member"]);
	return { ...org, myRole: me.role };
});

export const changeInvitationRole = command(
	v.object({
		invitationId: v.string(),
		role: v.picklist(["member", "admin", "owner"]),
	}),
	async ({ invitationId, role }) => {
		const invitation = await prisma.invitation.findUnique({
			where: { id: invitationId },
		});
		if (!invitation) error(404, "Invitation not found");
		const me = await requireOrgRole(invitation.organizationId, ["owner", "admin"]);
		if (role === "owner" && me.role !== "owner") error(403, "Only owners can invite owners");
		if (invitation.status != "pending") error(400, "Invitation is not pending");
		return await prisma.invitation.update({
			where: { id: invitationId },
			data: { role },
		});
	},
);

const linkRole = v.picklist(["member", "admin"]);
const newToken = () => randomBytes(24).toString("base64url");

export const getInviteLinks = query(v.string(), async (organizationId) => {
	await requireOrgRole(organizationId, ["owner", "admin"]);
	const links = await prisma.inviteLink.findMany({ where: { organizationId } });
	return linkRole.options.map((role) => {
		const link = links.find((l) => l.role === role);
		return { role, token: link?.token ?? null, enabled: link?.enabled ?? false };
	});
});

export const setInviteLinkEnabled = command(
	v.object({ organizationId: v.string(), role: linkRole, enabled: v.boolean() }),
	async ({ organizationId, role, enabled }) => {
		await requireOrgRole(organizationId, ["owner", "admin"]);
		await prisma.inviteLink.upsert({
			where: { organizationId_role: { organizationId, role } },
			create: {
				organizationId,
				role,
				enabled,
				token: newToken(),
				createdById: getRequestEvent().locals.user!.id,
			},
			update: { enabled },
		});
		await getInviteLinks(organizationId).refresh();
	},
);

export const resetInviteLink = command(
	v.object({ organizationId: v.string(), role: linkRole }),
	async ({ organizationId, role }) => {
		await requireOrgRole(organizationId, ["owner", "admin"]);
		await prisma.inviteLink.update({
			where: { organizationId_role: { organizationId, role } },
			data: { token: newToken() },
		});
		await getInviteLinks(organizationId).refresh();
	},
);
