import { isOrgWide } from "#lib/roles.ts";
import type { Prisma } from "@postpin-io/shared/db";
import type { Role } from "@postpin-io/shared/db/enums";

type Tx = Prisma.TransactionClient;

/**
 * Creates a grant, keeping grants minimal: a project grant replaces timeline grants inside it,
 * a timeline grant is skipped when a project grant already covers it. Idempotent.
 */
export async function createGrant(
	tx: Tx,
	g: { memberId: string; createdById: string | null } & (
		{ projectId: string; timelineId?: never } | { timelineId: string; projectId?: never }
	),
) {
	if (g.projectId) {
		await tx.memberGrant.deleteMany({
			where: { memberId: g.memberId, timeline: { projectId: g.projectId } },
		});
		await tx.memberGrant.upsert({
			where: { memberId_projectId: { memberId: g.memberId, projectId: g.projectId } },
			create: { memberId: g.memberId, projectId: g.projectId, createdById: g.createdById },
			update: {},
		});
		return;
	}
	const timeline = await tx.timeline.findUniqueOrThrow({
		where: { id: g.timelineId },
		select: { projectId: true },
	});
	const covered = await tx.memberGrant.count({
		where: { memberId: g.memberId, projectId: timeline.projectId },
	});
	if (covered) return;
	await tx.memberGrant.upsert({
		where: { memberId_timelineId: { memberId: g.memberId, timelineId: g.timelineId! } },
		create: { memberId: g.memberId, timelineId: g.timelineId!, createdById: g.createdById },
		update: {},
	});
}

/**
 * Makes the user a member of the org (an existing member keeps their role) and, for
 * project/timeline invites, grants that target. Used by e-mail invitations and invite links.
 */
export async function joinWithAccess(
	tx: Tx,
	join: {
		organizationId: string;
		userId: string;
		role: Role;
		projectId: string | null;
		timelineId: string | null;
		/** Who handed out the invitation or link */
		createdById: string | null;
	},
) {
	const member = await tx.member.upsert({
		where: { organizationId_userId: { organizationId: join.organizationId, userId: join.userId } },
		create: { organizationId: join.organizationId, userId: join.userId, role: join.role },
		update: {},
	});

	if (!isOrgWide(member.role)) {
		const base = { memberId: member.id, createdById: join.createdById };
		if (join.projectId) await createGrant(tx, { ...base, projectId: join.projectId });
		else if (join.timelineId) await createGrant(tx, { ...base, timelineId: join.timelineId });
	}
	return member;
}
