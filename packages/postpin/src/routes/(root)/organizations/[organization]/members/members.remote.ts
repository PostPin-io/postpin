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
import { INVITATION_TTL_MS, sendInvitationEmail } from "#lib/server/invitations.ts";
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
		myMemberId: me.id,
		canManageInviteLinks: roleAllows(me.role, "inviteLink", "read") && orgWide,
		canSeeInvitations,
		/** The e-mail form creates org-level invitations, which need an org-wide role */
		canInviteToOrg: can(me.role, "invitation", "create"),
		inviteRoles: INVITE_ROLES.filter((r) => canInviteAs(me.role, r)),
		members: members.map((m) => ({
			...m,
			/** Roles `me` may set on this member, including the current one if allowed at all */
			assignableRoles: ORG_ROLES.filter((r) => canChangeRole(me.role, m.role, r, ownerCount)),
			canViewGrants: !isOrgWide(m.role),
		})),
		invitations: invitations.map(({ timeline, ...i }) => {
			const ctx = { isOwn: i.inviterId === me.userId, hasGrant: hasGrantOn({ ...i, timeline }) };
			return {
				...i,
				canUpdate: can(me.role, "invitation", "update", ctx) && canInviteAs(me.role, i.role),
				canDelete: can(me.role, "invitation", "delete", ctx),
				/** Same rule as resendInvitation */
				canResend: can(me.role, "invitation", "update", ctx) && canInviteAs(me.role, i.role),
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

export const changeMemberRole = command(
	v.object({ memberId: v.string(), role: v.picklist(ORG_ROLES) }),
	async ({ memberId, role }) => {
		const { member: me } = await authorize("member", "updateRole", {
			type: "member",
			id: memberId,
		});

		// Isolation Type Serializable: two owners demoting each other at the same time must not leave zero owners
		await prisma.$transaction(
			async (tx) => {
				const target = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
				const ownerCount = await tx.member.count({
					where: { organizationId: target.organizationId, role: Role.OWNER },
				});
				if (!canChangeRole(me.role, target.role, role, ownerCount)) error(403, "Not allowed");
				await tx.member.update({ where: { id: memberId }, data: { role } });
			},
			{ isolationLevel: "Serializable" },
		);
	},
);
const InviteTarget = v.variant("type", [
	v.object({ type: v.literal("organization"), id: v.string() }),
	v.object({ type: v.literal("project"), id: v.string() }),
	v.object({ type: v.literal("timeline"), id: v.string() }),
]);

export const inviteMember = command(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
		role: v.picklist(INVITE_ROLES),
		target: InviteTarget,
	}),
	async ({ email, role, target }) => {
		const { user, member: me, target: resolved } = await authorize("invitation", "create", target);
		if (!canInviteAs(me.role, role)) error(403, "Not allowed");

		const alreadyMember = await prisma.member.count({
			where: { organizationId: resolved.organizationId, user: { email } },
		});
		// existing members get access via a grant, not an invitation
		if (alreadyMember) error(409, "Already a member of this organization");

		const where = {
			organizationId: resolved.organizationId,
			email,
			status: "pending",
			projectId: target.type === "project" ? target.id : null,
			timelineId: target.type === "timeline" ? target.id : null,
		};
		const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

		// same target again = refresh the pending invite instead of a duplicate
		const existing = await prisma.invitation.findFirst({ where });
		const invitation = existing
			? await prisma.invitation.update({
					where: { id: existing.id },
					data: { role, expiresAt, inviterId: user.id },
				})
			: await prisma.invitation.create({
					data: { ...where, role, expiresAt, inviterId: user.id },
				});

		const org = await prisma.organization.findUniqueOrThrow({
			where: { id: resolved.organizationId },
		});
		await sendInvitationEmail(invitation, org.name, user.name);
		await getOrg(org.slug).refresh();
	},
);

/** Sends the e-mail again and restarts the expiry, also for already expired invitations. */
export const resendInvitation = command(v.string(), async (invitationId) => {
	const { user, member: me } = await authorize("invitation", "update", {
		type: "invitation",
		id: invitationId,
	});
	const invitation = await prisma.invitation.findUniqueOrThrow({
		where: { id: invitationId },
		include: { organization: { select: { name: true, slug: true } } },
	});
	if (invitation.status !== "pending") error(400, "Invitation is not pending");
	if (!canInviteAs(me.role, invitation.role)) error(403, "Not allowed");

	await prisma.invitation.update({
		where: { id: invitationId },
		data: { expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
	});
	await sendInvitationEmail(invitation, invitation.organization.name, user.name);
	await getOrg(invitation.organization.slug).refresh();
});
