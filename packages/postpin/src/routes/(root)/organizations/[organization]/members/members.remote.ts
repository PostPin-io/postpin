import {
	can,
	canChangeRole,
	canInviteAs,
	INVITE_ROLES,
	isOrgWide,
	MANAGER_ROLES,
	ORG_ROLES,
	roleAllows,
} from "#lib/roles.ts";
import { prisma } from "#lib/server/database.ts";
import { authorize, requireOrgRole } from "#lib/server/org-access.ts";
import { command, query } from "$app/server";
import { Role } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

export const getOrg = query(v.string(), async (slug) => {
	const org = await prisma.organization.findUnique({ where: { slug } });
	if (!org) error(404, "Organization not found");

	const me = await requireOrgRole(org.id, Role.REVIEWER);
	const orgWide = isOrgWide(me.role);

	const myGrants = orgWide
		? []
		: await prisma.memberGrant.findMany({
				where: { memberId: me.id },
				select: { projectId: true, timelineId: true, timeline: { select: { projectId: true } } },
			});
	const grantedProjects = new Set(myGrants.flatMap((g) => (g.projectId ? [g.projectId] : [])));
	const grantedTimelines = new Set(myGrants.flatMap((g) => (g.timelineId ? [g.timelineId] : [])));
	/** Loose: every project I have any grant in */
	const projectIds = [
		...new Set(
			myGrants.map((g) => g.projectId ?? g.timeline?.projectId).filter((id) => id != null),
		),
	];
	const inMyProjects = {
		OR: [{ projectId: { in: projectIds } }, { timeline: { projectId: { in: projectIds } } }],
	};

	const canSeeInvitations = roleAllows(me.role, "invitation", "read");

	const [members, invitations, ownerCount] = await Promise.all([
		prisma.member.findMany({
			where: {
				organizationId: org.id,
				...(orgWide
					? {}
					: {
							OR: [
								{ id: me.id },
								{ role: { in: MANAGER_ROLES } },
								{ memberGrants: { some: inMyProjects } },
							],
						}),
			},
			include: { user: { select: { id: true, name: true, email: true } } },
		}),
		canSeeInvitations
			? prisma.invitation.findMany({
					where: { organizationId: org.id, status: "pending", ...(orgWide ? {} : inMyProjects) },
					include: { timeline: { select: { projectId: true } } },
					orderBy: { createdAt: "desc" },
				})
			: [],
		prisma.member.count({ where: { organizationId: org.id, role: Role.OWNER } }),
	]);

	/** Same rule as `hasGrant` in authorize(): strict for timeline targets, org-level never */
	const hasGrantOn = (i: (typeof invitations)[number]) => {
		if (orgWide) return true;
		if (i.projectId) return grantedProjects.has(i.projectId);
		if (i.timelineId)
			return grantedTimelines.has(i.timelineId) || grantedProjects.has(i.timeline!.projectId);
		return false;
	};

	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		myRole: me.role,
		canManageInviteLinks: roleAllows(me.role, "inviteLink", "read") && orgWide,
		canSeeInvitations,
		/** The e-mail form creates org-level invitations, which need an org-wide role */
		canInviteToOrg: can(me.role, "invitation", "create"),
		inviteRoles: INVITE_ROLES.filter((r) => canInviteAs(me.role, r)),
		members: members.map((m) => ({
			...m,
			/** Roles `me` may set on this member, including the current one if allowed at all */
			assignableRoles: ORG_ROLES.filter((r) => canChangeRole(me.role, m.role, r, ownerCount)),
		})),
		invitations: invitations.map(({ timeline, ...i }) => {
			const ctx = { isOwn: i.inviterId === me.userId, hasGrant: hasGrantOn({ ...i, timeline }) };
			return {
				...i,
				canUpdate: can(me.role, "invitation", "update", ctx) && canInviteAs(me.role, i.role),
				canDelete: can(me.role, "invitation", "delete", ctx),
				/** Resending goes through better-auth, which only lets org-wide roles invite */
				canResend: orgWide && canInviteAs(me.role, i.role),
			};
		}),
	};
});

export const changeInvitationRole = command(
	v.object({
		invitationId: v.string(),
		role: v.picklist(INVITE_ROLES),
	}),
	async ({ invitationId, role }) => {
		const { member: me } = await authorize("invitation", "update", {
			type: "invitation",
			id: invitationId,
		});
		const invitation = await prisma.invitation.findUnique({
			where: { id: invitationId },
		});
		if (!invitation) error(404, "Invitation not found");
		if (!(canInviteAs(me.role, role) && canInviteAs(me.role, invitation.role)))
			error(403, "You cannot invite someone with a higher role");
		if (invitation.status != "pending") error(400, "Invitation is not pending");
		if (invitation.expiresAt < new Date()) error(400, "Invitation has expired");
		return await prisma.invitation.update({
			where: { id: invitationId },
			data: { role },
		});
	},
);

/** Own command instead of better-auth's, so Members can revoke their own project/timeline invites */
export const cancelInvitation = command(v.string(), async (invitationId) => {
	await authorize("invitation", "delete", { type: "invitation", id: invitationId });
	const { count } = await prisma.invitation.updateMany({
		where: { id: invitationId, status: "pending" },
		data: { status: "canceled" },
	});
	if (count === 0) error(400, "Invitation is not pending");
});

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
