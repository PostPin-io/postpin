import {
	can,
	canChangeRole,
	canInviteAs,
	INVITE_ROLES,
	canRemoveMember,
	isOrgWide,
	MANAGER_ROLES,
	ORG_ROLES,
	roleAllows,
} from "#lib/roles.ts";

import { prisma } from "#lib/server/database.ts";
import { INVITATION_TTL_MS, sendInvitationEmail } from "#lib/server/invitations.ts";
import { authorize, requireOrgRole } from "#lib/server/org-access.ts";
import { command, query } from "$app/server";
import { Prisma, Role } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { InviteTarget, targetColumns } from "#lib/invite-target.ts";
import {
	newInviteToken,
	revokeInvitesOf,
	revokeInvitesOutsideGrants,
} from "#lib/server/invite-links.ts";

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
			assignableRoles: ORG_ROLES.filter((r) => canChangeRole(me.role, m.role, r, ownerCount)),
			canViewGrants: !isOrgWide(m.role),
			/** Same rule as removeMember; yourself → "leave organization" instead */
			canRemove: m.id !== me.id && canRemoveMember(me.role, m.role, ownerCount),
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
/** Disabling / resetting a link = deleting it in matrix terms: Member only own, Admin+ all */
function assertMayManageLink(role: Role, isOwn: boolean) {
	if (!can(role, "inviteLink", "delete", { isOwn, hasGrant: true })) {
		error(403, "Only the person who created this link or an admin can change it");
	}
}

export const getInviteLinks = query(InviteTarget, async (target) => {
	const { user, member, target: resolved } = await authorize("inviteLink", "read", target);
	const links = await prisma.inviteLink.findMany({
		where: { organizationId: resolved.organizationId, ...targetColumns(target) },
	});
	// Member sees only roles they may hand out (Member/Reviewer), Admin+ all invite roles
	return INVITE_ROLES.filter((r) => canInviteAs(member.role, r)).map((role) => {
		const link = links.find((l) => l.role === role);
		return {
			role,
			token: link?.token ?? null,
			enabled: link?.enabled ?? false,
			/** No link yet → anyone allowed to create one; existing → creator or Admin+ */
			canManage:
				!link ||
				can(member.role, "inviteLink", "delete", {
					isOwn: link.createdById === user.id,
					hasGrant: true,
				}),
		};
	});
});

export const setInviteLinkEnabled = command(
	v.object({ target: InviteTarget, role: linkRole, enabled: v.boolean() }),
	async ({ target, role, enabled }) => {
		const { user, member, target: resolved } = await authorize("inviteLink", "create", target);
		if (!canInviteAs(member.role, role)) error(403, "You cannot create links for a higher role");

		const where = { organizationId: resolved.organizationId, role, ...targetColumns(target) };
		const existing = await prisma.inviteLink.findFirst({ where });

		if (existing) {
			assertMayManageLink(member.role, existing.createdById === user.id);
			await prisma.inviteLink.update({ where: { id: existing.id }, data: { enabled } });
		} else if (enabled) {
			try {
				await prisma.inviteLink.create({
					data: { ...where, enabled, token: newInviteToken(), createdById: user.id },
				});
			} catch (e) {
				// two people enabling the same link at once → unique index wins
				if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
					error(409, "This link was just created by someone else, please reload");
				}
				throw e;
			}
		}
		await getInviteLinks(target).refresh();
	},
);

export const resetInviteLink = command(
	v.object({ target: InviteTarget, role: linkRole }),
	async ({ target, role }) => {
		const { user, member, target: resolved } = await authorize("inviteLink", "create", target);
		if (!canInviteAs(member.role, role)) error(403, "You cannot reset links for a higher role");

		const existing = await prisma.inviteLink.findFirst({
			where: { organizationId: resolved.organizationId, role, ...targetColumns(target) },
		});
		if (!existing) error(404, "Invite link not found");
		assertMayManageLink(member.role, existing.createdById === user.id);

		await prisma.inviteLink.update({
			where: { id: existing.id },
			data: { token: newInviteToken() },
		});
		await getInviteLinks(target).refresh();
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
				await revokeInvitesOf(tx, target, role);
				// Admin → Member/Reviewer: from now on only their grants count, not the whole org
				await revokeInvitesOutsideGrants(tx, { ...target, role });
			},
			{ isolationLevel: "Serializable" },
		);
	},
);

export const removeMember = command(v.string(), async (memberId) => {
	const { member: me } = await authorize("member", "remove", { type: "member", id: memberId });

	if (memberId === me.id) error(400, "Use 'leave organization' to remove yourself");

	try {
		await prisma.$transaction(
			async (tx) => {
				const target = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
				const ownerCount = await tx.member.count({
					where: { organizationId: target.organizationId, role: Role.OWNER },
				});
				if (!canRemoveMember(me.role, target.role, ownerCount)) error(403, "Not allowed");

				await tx.member.delete({ where: { id: memberId } });
				await revokeInvitesOf(tx, target, null);
				await tx.session.updateMany({
					where: { userId: target.userId, activeOrganizationId: target.organizationId },
					data: { activeOrganizationId: null },
				});
				await tx.user.updateMany({
					where: { id: target.userId, lastActiveOrganizationId: target.organizationId },
					data: { lastActiveOrganizationId: null },
				});
			},
			{ isolationLevel: "Serializable" },
		);
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
			error(409, "The member list changed at the same time, please try again");
		}
		throw e;
	}

	const org = await prisma.organization.findUniqueOrThrow({
		where: { id: me.organizationId },
		select: { slug: true },
	});
	await getOrg(org.slug).refresh();
});

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
		if (existing) {
			await authorize("invitation", "update", { type: "invitation", id: existing.id });
		}
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

export const getTargetInvitations = query(InviteTarget, async (target) => {
	const { user, member, target: resolved } = await authorize("invitation", "read", target);
	const invitations = await prisma.invitation.findMany({
		where: { organizationId: resolved.organizationId, status: "pending", ...targetColumns(target) },
		orderBy: { createdAt: "desc" },
		select: { id: true, email: true, role: true, createdAt: true, inviterId: true },
	});
	return invitations.map(({ inviterId, ...i }) => {
		// hasGrant: true, authorize() above already proved access to this target
		const ctx = { isOwn: inviterId === user.id, hasGrant: true };
		return {
			...i,
			canDelete: can(member.role, "invitation", "delete", ctx),
			canResend: can(member.role, "invitation", "update", ctx) && canInviteAs(member.role, i.role),
		};
	});
});
