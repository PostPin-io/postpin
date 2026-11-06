import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { prisma } from "#lib/server/database.ts";
import { ACTIONS, can, hasRoleOrHigher, isOrgWide, type Action, type Area } from "#lib/roles.ts";
import type { Member, Prisma } from "@postpin-io/shared/db";
import type { Role } from "@postpin-io/shared/db/enums";

/**
 * The object an action is performed on. For `create`, this is the parent:
 * new timeline → project, new marker → export, new project → organization.
 */
export type Target = { type: Area; id: string };

/** What `can()` needs to know about a target, loaded from the DB */
export type ResolvedTarget = {
	organizationId: string;
	/** Project the target lives in (null for org-level targets) */
	projectId: string | null;
	/** Timeline the target lives in (null for project- and org-level targets) */
	timelineId: string | null;
	/** User who created the target, null if unknown or deleted */
	ownerId: string | null;
	/**
	 * A grant on any timeline inside the project counts as access.
	 * Needed for project-level things a timeline-only member must still use (categories).
	 */
	anyGrantInProject?: true;
};

// ─── Resolving targets ──────────────────────────────────────────────────────

const exportPath = {
	timelineId: true,
	timeline: { select: { projectId: true, project: { select: { organizationId: true } } } },
} as const;

function fromExport(exp: {
	timelineId: string;
	timeline: { projectId: string; project: { organizationId: string } };
}) {
	return {
		organizationId: exp.timeline.project.organizationId,
		projectId: exp.timeline.projectId,
		timelineId: exp.timelineId,
	};
}

/** One query per target type. Returns null if the target does not exist. */
async function resolveTarget({ type, id }: Target): Promise<ResolvedTarget | null> {
	switch (type) {
		case "organization": {
			const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
			return org && { organizationId: org.id, projectId: null, timelineId: null, ownerId: null };
		}
		case "project": {
			const p = await prisma.project.findUnique({
				where: { id },
				select: { organizationId: true, creatorId: true },
			});
			return (
				p && {
					organizationId: p.organizationId,
					projectId: id,
					timelineId: null,
					ownerId: p.creatorId,
				}
			);
		}
		case "timeline": {
			const t = await prisma.timeline.findUnique({
				where: { id },
				select: { projectId: true, project: { select: { organizationId: true } } },
			});
			return (
				t && {
					organizationId: t.project.organizationId,
					projectId: t.projectId,
					timelineId: id,
					ownerId: null,
				}
			);
		}
		case "export": {
			const e = await prisma.export.findUnique({ where: { id }, select: exportPath });
			return e && { ...fromExport(e), ownerId: null };
		}
		case "marker": {
			const m = await prisma.marker.findUnique({
				where: { id },
				select: { authorId: true, export: { select: exportPath } },
			});
			return m && { ...fromExport(m.export), ownerId: m.authorId };
		}
		case "shareLink": {
			const s = await prisma.shareLink.findUnique({
				where: { id },
				select: { creatorId: true, export: { select: exportPath } },
			});
			return s && { ...fromExport(s.export), ownerId: s.creatorId };
		}
		case "category": {
			const c = await prisma.category.findUnique({
				where: { id },
				select: {
					createdById: true,
					projectId: true,
					project: { select: { organizationId: true } },
				},
			});
			return (
				c && {
					organizationId: c.project.organizationId,
					projectId: c.projectId,
					timelineId: null,
					ownerId: c.createdById,
					anyGrantInProject: true,
				}
			);
		}
		case "invitation": {
			const i = await prisma.invitation.findUnique({
				where: { id },
				select: {
					organizationId: true,
					inviterId: true,
					projectId: true,
					timelineId: true,
					timeline: { select: { projectId: true } },
				},
			});
			return (
				i && {
					organizationId: i.organizationId,
					projectId: i.projectId ?? i.timeline?.projectId ?? null,
					timelineId: i.timelineId,
					ownerId: i.inviterId,
				}
			);
		}
		case "inviteLink": {
			const l = await prisma.inviteLink.findUnique({
				where: { id },
				select: {
					organizationId: true,
					createdById: true,
					projectId: true,
					timelineId: true,
					timeline: { select: { projectId: true } },
				},
			});
			return (
				l && {
					organizationId: l.organizationId,
					projectId: l.projectId ?? l.timeline?.projectId ?? null,
					timelineId: l.timelineId,
					ownerId: l.createdById,
				}
			);
		}
		case "grant": {
			const g = await prisma.memberGrant.findUnique({
				where: { id },
				select: {
					createdById: true,
					projectId: true,
					timelineId: true,
					timeline: { select: { projectId: true } },
					member: { select: { organizationId: true } },
				},
			});
			return (
				g && {
					organizationId: g.member.organizationId,
					projectId: g.projectId ?? g.timeline?.projectId ?? null,
					timelineId: g.timelineId,
					ownerId: g.createdById,
				}
			);
		}
		case "member": {
			// Org-level: only org-wide roles pass. Member/Reviewer see colleagues
			// via a filtered list query, not via authorize().
			const m = await prisma.member.findUnique({ where: { id }, select: { organizationId: true } });
			return (
				m && { organizationId: m.organizationId, projectId: null, timelineId: null, ownerId: null }
			);
		}
	}
}

// ─── Grants ─────────────────────────────────────────────────────────────────

/**
 * Does the member have a grant at or above the target?
 * A project grant covers everything in the project, also timelines created later.
 */
async function hasGrant(memberId: string, target: ResolvedTarget, loose: boolean) {
	if (!target.projectId) return false; // org-level targets are never covered by a grant

	const or: object[] = [{ projectId: target.projectId }];
	if (target.timelineId) or.push({ timelineId: target.timelineId });
	else if (loose) or.push({ timeline: { projectId: target.projectId } });

	const count = await prisma.memberGrant.count({ where: { memberId, OR: or } });
	return count > 0;
}

// ─── Accessible resources (list queries) ────────────────────────────────────
// Same grant rules as `hasGrant`, as a Prisma `where` for list queries:
// org-wide roles see everything in the org; everyone else only what lies at or
// below one of their grants. A project also counts as accessible when only one
// of its timelines is granted (the `loose` case in `hasGrant`).

type AccessMember = Pick<Member, "id" | "organizationId" | "role">;

export function accessibleProjects(member: AccessMember): Prisma.ProjectWhereInput {
	const inOrg = { organizationId: member.organizationId };
	if (isOrgWide(member.role)) return inOrg;
	return {
		...inOrg,
		OR: [
			{ memberGrants: { some: { memberId: member.id } } },
			{ timelines: { some: { memberGrants: { some: { memberId: member.id } } } } },
		],
	};
}

export function accessibleTimelines(member: AccessMember): Prisma.TimelineWhereInput {
	const inOrg = { project: { organizationId: member.organizationId } };
	if (isOrgWide(member.role)) return inOrg;
	return {
		...inOrg,
		OR: [
			{ memberGrants: { some: { memberId: member.id } } },
			{ project: { memberGrants: { some: { memberId: member.id } } } },
		],
	};
}

export function accessibleExports(member: AccessMember): Prisma.ExportWhereInput {
	return { timeline: accessibleTimelines(member) };
}

/**
 * In-memory version of `hasGrant` (strict) for checking many targets at once.
 * Org-wide roles cover everything.
 */
export async function grantScope(member: AccessMember) {
	if (isOrgWide(member.role))
		return {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			covers: (_projectId: string, _timelineId?: string | null) => true,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			coversAny: (_projectId: string) => true,
		};
	const mine = await prisma.memberGrant.findMany({
		where: { memberId: member.id },
		select: { projectId: true, timelineId: true, timeline: { select: { projectId: true } } },
	});

	const projects = new Set(mine.flatMap((g) => (g.projectId ? [g.projectId] : [])));
	const timelines = new Set(mine.flatMap((g) => (g.timelineId ? [g.timelineId] : [])));
	const anyInProject = new Set(mine.map((g) => g.projectId ?? g.timeline!.projectId));

	return {
		covers: (projectId: string, timelineId?: string | null) =>
			projects.has(projectId) || (!!timelineId && timelines.has(timelineId)),
		coversAny: (projectId: string) => anyInProject.has(projectId),
	};
}

/** Same rules as authorize(), for many targets at once and without throwing. For UI flags. */
export async function accessChecker(member: AccessMember & { userId: string }) {
	const scope = await grantScope(member);
	return <A extends Area>(
		area: A,
		action: Action<A>,
		t: {
			projectId: string | null;
			timelineId?: string | null;
			ownerId?: string | null;
			loose?: boolean;
		},
	) =>
		can(member.role, area, action, {
			isOwn: t.ownerId != null && t.ownerId === member.userId,
			hasGrant: !t.projectId
				? false
				: t.loose
					? scope.coversAny(t.projectId)
					: scope.covers(t.projectId, t.timelineId),
		});
}

// ─── Members ────────────────────────────────────────────────────────────────

/** Membership of the signed-in user in their active organization, null if there is none. */
export async function getActiveMember() {
	const { user, session } = getRequestEvent().locals;
	const organizationId = session?.activeOrganizationId;
	if (!user || !organizationId) return null;
	return await prisma.member.findFirst({ where: { organizationId, userId: user.id } });
}

function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return user;
}

async function requireMember(organizationId: string, userId: string) {
	const member = await prisma.member.findFirst({ where: { organizationId, userId } });
	// 404, not 403: don't reveal that the org exists
	if (!member) error(404, "Not found");
	return member;
}

/** For checks about who someone is, e.g. "admins and above". Prefer authorize(). */
export async function requireOrgRole(organizationId: string, minRole: Role) {
	const user = requireUser();
	const member = await requireMember(organizationId, user.id);
	if (!hasRoleOrHigher(member.role, minRole)) error(403, "Not allowed");
	return member;
}

// ─── authorize ──────────────────────────────────────────────────────────────

/**
 * Loads the target and the current user's membership, then asks `can()`.
 * Throws 401 / 403 / 404, otherwise returns what the caller needs next.
 *
 * The org always comes from the target, never from the request:
 * otherwise an admin of org A could act on a target in org B.
 */
export async function authorize<A extends Area>(area: A, action: Action<A>, target: Target) {
	const user = requireUser();

	const resolved = await resolveTarget(target);
	if (!resolved) error(404, "Not found");

	const member = await requireMember(resolved.organizationId, user.id);

	// Navigating into a project you only have a timeline grant for must work.
	// Same for creating a category: its parent is the project, but categories
	// must be usable with a timeline grant (see anyGrantInProject).
	const loose =
		resolved.anyGrantInProject === true ||
		(target.type === "project" && (action === "read" || area === "category"));

	const ctx = {
		isOwn: resolved.ownerId !== null && resolved.ownerId === user.id,
		hasGrant: isOrgWide(member.role) ? true : await hasGrant(member.id, resolved, loose),
	};

	if (!can(member.role, area, action, ctx)) {
		// 403 only if the user may see the target at all, otherwise pretend it doesn't exist
		error(
			canSee(member.role, target, ctx) ? 403 : 404,
			canSee(member.role, target, ctx) ? "Not allowed" : "Not found",
		);
	}

	return { user, member, target: resolved };
}
const MAX_BULK_IDS = 500;

export async function authorizeMarkers(
	action: "update" | "delete",
	exportId: string,
	ids: string[],
) {
	const unique = [...new Set(ids)];
	if (unique.length === 0) error(400, "No markers given");
	if (unique.length > MAX_BULK_IDS) error(400, "Too many markers, 500 is the limit");

	const { user, member, target } = await authorize("export", "read", {
		type: "export",
		id: exportId,
	});

	const markers = await prisma.marker.findMany({
		where: { id: { in: unique }, exportId },
		select: { id: true, authorId: true, categoryId: true },
	});

	if (markers.length !== unique.length) error(404, "Not found");

	const allowedForAll = can(member.role, "marker", action, { hasGrant: true, isOwn: false });
	if (!allowedForAll) {
		const allOwn = markers.every((m) => m.authorId !== null && m.authorId === user.id);
		if (!allOwn) error(403, "Not allowed");
	}

	return { user, member, target, markers };
}

function canSee(role: Role, target: Target, ctx: { isOwn: boolean; hasGrant: boolean }) {
	const actions: readonly string[] = ACTIONS[target.type];
	// Areas without a read action (organization, grant): being a member is enough
	if (!actions.includes("read")) return true;
	return can(role, target.type, "read" as Action<typeof target.type>, ctx);
}

/** Gate for anything addressed by `mediaId`: requires read access to the export the media belongs to. */
export async function requireMediaAccess(mediaId: string) {
	const exp = await prisma.export.findFirst({ where: { mediaId }, select: { id: true } });
	if (!exp) error(404, "Not found");
	return await authorize("export", "read", { type: "export", id: exp.id });
}
