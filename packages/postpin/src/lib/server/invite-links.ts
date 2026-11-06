import { randomBytes } from "node:crypto";
import type { Prisma } from "@postpin-io/shared/db";
import type { Role } from "@postpin-io/shared/db/enums";
import { INVITE_ROLES, canInviteAs, isOrgWide } from "#lib/roles.ts";

type Tx = Prisma.TransactionClient;

export const newInviteToken = () => randomBytes(24).toString("base64url");

/**
 * Takes back what a member handed out and may no longer hand out: their invite links are turned
 * off with a fresh token (a saved copy stays dead even if someone enables the link again), their
 * pending e-mail invitations are canceled.
 *
 * `newRole` null = they left the org: everything. On a demotion: only roles above the new role.
 * Call inside the transaction that removes or demotes the member.
 */
export async function revokeInvitesOf(
	tx: Tx,
	member: { organizationId: string; userId: string },
	newRole: Role | null,
) {
	const roles = newRole ? INVITE_ROLES.filter((r) => !canInviteAs(newRole, r)) : INVITE_ROLES;
	if (roles.length === 0) return;

	await revoke(tx, {
		links: {
			organizationId: member.organizationId,
			createdById: member.userId,
			role: { in: roles },
		},
		invitations: {
			organizationId: member.organizationId,
			inviterId: member.userId,
			role: { in: roles },
		},
	});
}

/**
 * After a grant was removed: takes back the member's links and pending invitations for targets
 * they no longer have a grant on. A project needs a project grant (that's what creating an invite
 * there needs); a timeline is still covered by a grant on its project.
 * Org-wide roles need no grants, nothing to do for them.
 */
export async function revokeInvitesOutsideGrants(
	tx: Tx,
	member: { id: string; organizationId: string; userId: string; role: Role },
) {
	if (isOrgWide(member.role)) return;

	const grants = await tx.memberGrant.findMany({
		where: { memberId: member.id },
		select: { projectId: true, timelineId: true },
	});
	const projects = new Set(grants.flatMap((g) => (g.projectId ? [g.projectId] : [])));
	const timelines = new Set(grants.flatMap((g) => (g.timelineId ? [g.timelineId] : [])));
	const covered = (t: {
		projectId: string | null;
		timelineId: string | null;
		timeline: { projectId: string } | null;
	}) =>
		t.projectId
			? projects.has(t.projectId)
			: !!t.timelineId && (timelines.has(t.timelineId) || projects.has(t.timeline!.projectId));

	// Filtered here, not in SQL: NOT (… IN …) on nullable target columns would skip rows silently
	const target = {
		projectId: true,
		timelineId: true,
		timeline: { select: { projectId: true } },
	} as const;
	const mine = { organizationId: member.organizationId };
	const [links, invitations] = await Promise.all([
		tx.inviteLink.findMany({
			where: { ...mine, createdById: member.userId },
			select: { id: true, ...target },
		}),
		tx.invitation.findMany({
			where: { ...mine, inviterId: member.userId, status: "pending" },
			select: { id: true, ...target },
		}),
	]);

	await revoke(tx, {
		links: { id: { in: links.filter((l) => !covered(l)).map((l) => l.id) } },
		invitations: { id: { in: invitations.filter((i) => !covered(i)).map((i) => i.id) } },
	});
}

async function revoke(
	tx: Tx,
	where: { links: Prisma.InviteLinkWhereInput; invitations: Prisma.InvitationWhereInput },
) {
	// Disabled links too: someone could enable them again with the old token.
	// One update per link, every link needs its own new token (tokens are unique).
	const links = await tx.inviteLink.findMany({ where: where.links, select: { id: true } });
	for (const { id } of links) {
		await tx.inviteLink.update({
			where: { id },
			data: { enabled: false, token: newInviteToken() },
		});
	}

	await tx.invitation.updateMany({
		where: { ...where.invitations, status: "pending" },
		data: { status: "canceled" },
	});
}
