import { can, isOrgWide, MANAGER_ROLES } from "#lib/roles.ts";
import { prisma } from "#lib/server/database.ts";
import { createGrant } from "#lib/server/grants.ts";
import { revokeInvitesOutsideGrants } from "#lib/server/invite-links.ts";
import {
	accessibleProjects,
	accessibleTimelines,
	authorize,
	grantScope,
	requireOrgRole,
} from "#lib/server/org-access.ts";
import { command, getRequestEvent, query } from "$app/server";
import { Prisma, Role } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

const GrantTarget = v.variant("type", [
	v.object({ type: v.literal("project"), id: v.string() }),
	v.object({ type: v.literal("timeline"), id: v.string() }),
]);

export const addGrant = command(
	v.object({ memberId: v.string(), target: GrantTarget }),
	async ({ memberId, target }) => {
		const { user, target: resolved } = await authorize("grant", "create", target);

		const grantee = await prisma.member.findUnique({ where: { id: memberId } });
		// one must only create grants for members of the same organization
		if (!grantee || grantee.organizationId !== resolved.organizationId) error(404, "Not found");
		// org-wide roles don't need grants, they already have access to everything
		if (isOrgWide(grantee.role)) error(400, "Admins and owners already see everything");
		// if its a timeline grant and the grantee has a project-wide grant, they already have access to the timeline
		if (
			target.type === "timeline" &&
			(await prisma.memberGrant.findFirst({
				where: { memberId, projectId: resolved.projectId },
			}))
		) {
			error(400, "Grantee already has access to the timeline's project");
		}

		try {
			// createGrant also removes timeline grants a new project grant makes redundant
			await prisma.$transaction(async (tx) => {
				await createGrant(tx, {
					memberId,
					createdById: user.id,
					...(target.type === "project" ? { projectId: target.id } : { timelineId: target.id }),
				});
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // already granted
			throw err;
		}
	},
);
export const removeGrant = command(v.string(), async (grantId) => {
	await authorize("grant", "delete", { type: "grant", id: grantId });
	await prisma.$transaction(async (tx) => {
		const { member } = await tx.memberGrant.delete({
			where: { id: grantId },
			select: { member: true },
		});
		// Links and invitations they handed out for what they no longer see stop working
		await revokeInvitesOutsideGrants(tx, member);
	});
});

const memberSelect = {
	id: true,
	role: true,
	user: { select: { name: true, email: true } },
} as const;

export const getTargetAccess = query(GrantTarget, async (target) => {
	const { user, member: me, target: resolved } = await authorize("grant", "create", target);
	const grantInclude = { member: { select: memberSelect } } as const;

	const [direct, inherited, orgMembers] = await Promise.all([
		prisma.memberGrant.findMany({
			where: target.type === "project" ? { projectId: target.id } : { timelineId: target.id },
			include: grantInclude,
			orderBy: { createdAt: "asc" },
		}),
		// on a timeline, project grants also give access
		target.type === "timeline"
			? prisma.memberGrant.findMany({
					where: { projectId: resolved.projectId! },
					include: grantInclude,
				})
			: [],
		prisma.member.findMany({
			where: { organizationId: resolved.organizationId, role: { notIn: MANAGER_ROLES } },
			select: memberSelect,
		}),
	]);

	const covered = new Set([...direct, ...inherited].map((g) => g.memberId));

	return {
		grants: direct.map((g) => ({
			id: g.id,
			member: g.member,
			// hasGrant: true, because authorize() above already proved our grant covers this target
			canDelete: can(me.role, "grant", "delete", {
				isOwn: g.createdById === user.id,
				hasGrant: true,
			}),
		})),
		inherited: inherited.map((g) => ({ id: g.id, member: g.member })),
		candidates: orgMembers.filter((m) => !covered.has(m.id)),
	};
});

export const getMemberGrants = query(v.string(), async (memberId) => {
	const grantee = await prisma.member.findUnique({
		where: { id: memberId },
		select: { organizationId: true },
	});
	if (!grantee) error(404, "Not found");

	const me = await requireOrgRole(grantee.organizationId, Role.REVIEWER); // 404 if not in that org
	const { user } = getRequestEvent().locals;
	const scope = await grantScope(me);

	const grants = await prisma.memberGrant.findMany({
		where: {
			memberId,
			...(isOrgWide(me.role)
				? {}
				: { OR: [{ project: accessibleProjects(me) }, { timeline: accessibleTimelines(me) }] }),
		},
		include: {
			project: { select: { id: true, name: true } },
			timeline: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
		},
		orderBy: { createdAt: "asc" },
	});

	return grants.map((g) => {
		const projectId = g.project?.id ?? g.timeline!.project.id;
		return {
			id: g.id,
			label: g.project ? g.project.name : `${g.timeline!.project.name} › ${g.timeline!.name}`,
			kind: g.project ? ("project" as const) : ("timeline" as const),
			canDelete: can(me.role, "grant", "delete", {
				isOwn: g.createdById === user!.id,
				hasGrant: scope.covers(projectId, g.timeline?.id),
			}),
		};
	});
});
