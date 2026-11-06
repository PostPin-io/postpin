import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	accessChecker,
	accessibleExports,
	accessibleProjects,
	accessibleTimelines,
	authorize,
	authorizeMarkers,
	getActiveMember,
	requireMediaAccess,
	requireOrgRole,
} from "#lib/server/org-access.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

/**
 * One org with two projects; project A has two timelines, each with an export,
 * a category and a marker. A second org exists to test isolation.
 */
async function world() {
	const org = await f.createOrg();
	const other = await f.createOrg();

	const owner = await f.createMember(org, OWNER);
	const projectA = await f.createProject(org, { creator: owner.user });
	const projectB = await f.createProject(org);
	const tl1 = await f.createTimeline(projectA);
	const tl2 = await f.createTimeline(projectA);
	const tlB = await f.createTimeline(projectB);
	const exp1 = await f.createExport(tl1, { media: true });
	const exp2 = await f.createExport(tl2);
	const expB = await f.createExport(tlB);
	const category = await f.createCategory(projectA, { createdBy: owner.user });
	const marker1 = await f.createMarker(exp1, category, { author: owner.user });

	const otherOwner = await f.createMember(other, OWNER);
	const otherProject = await f.createProject(other);

	return {
		org,
		other,
		owner,
		otherOwner,
		projectA,
		projectB,
		tl1,
		tl2,
		tlB,
		exp1,
		exp2,
		expB,
		category,
		marker1,
		otherProject,
	};
}

type World = Awaited<ReturnType<typeof world>>;
let w: World;

beforeEach(async () => {
	w = await world();
});

/** New member of the world's org, signed in */
async function as(role: Role) {
	const m = await f.createMember(w.org, role);
	signIn(m.user, w.org.id);
	return m;
}

// ─── authorize: basics ──────────────────────────────────────────────────────

describe("authorize", () => {
	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(authorize("project", "read", { type: "project", id: w.projectA.id }), 401);
	});

	it("404 when the target does not exist", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(authorize("project", "read", { type: "project", id: "nope" }), 404);
	});

	it("404 for an owner of another org, even with that org active", async () => {
		signIn(w.otherOwner.user, w.org.id);
		await expectStatus(authorize("project", "read", { type: "project", id: w.projectA.id }), 404);
	});

	it("takes the org from the target, not from the session", async () => {
		// owner of `org` with the other org as active org still acts on `org`'s project
		signIn(w.owner.user, w.other.id);
		const { member, target } = await authorize("project", "rename", {
			type: "project",
			id: w.projectA.id,
		});
		expect(member.id).toBe(w.owner.id);
		expect(target.organizationId).toBe(w.org.id);
	});

	it("returns user, member and the resolved target", async () => {
		signIn(w.owner.user, w.org.id);
		const res = await authorize("marker", "update", { type: "marker", id: w.marker1.id });
		expect(res.user.id).toBe(w.owner.user.id);
		expect(res.target).toEqual({
			organizationId: w.org.id,
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			ownerId: w.owner.user.id,
		});
	});

	it.each([OWNER, ADMIN])("%s needs no grant", async (role) => {
		await as(role);
		await authorize("project", "delete", { type: "project", id: w.projectB.id });
		await authorize("timeline", "rename", { type: "timeline", id: w.tlB.id });
		await authorize("marker", "update", { type: "marker", id: w.marker1.id });
	});
});

// ─── authorize: resolving each target type ──────────────────────────────────

describe("authorize resolves", () => {
	beforeEach(() => {
		signIn(w.owner.user, w.org.id);
	});

	it("organization", async () => {
		const { target } = await authorize("organization", "rename", {
			type: "organization",
			id: w.org.id,
		});
		expect(target).toEqual({
			organizationId: w.org.id,
			projectId: null,
			timelineId: null,
			ownerId: null,
		});
	});

	it("project (owner = creator)", async () => {
		const { target } = await authorize("project", "read", { type: "project", id: w.projectA.id });
		expect(target).toMatchObject({ projectId: w.projectA.id, ownerId: w.owner.user.id });
	});

	it("timeline", async () => {
		const { target } = await authorize("timeline", "read", { type: "timeline", id: w.tl2.id });
		expect(target).toMatchObject({ projectId: w.projectA.id, timelineId: w.tl2.id, ownerId: null });
	});

	it("export", async () => {
		const { target } = await authorize("export", "read", { type: "export", id: w.exp2.id });
		expect(target).toMatchObject({ projectId: w.projectA.id, timelineId: w.tl2.id });
	});

	it("category (any grant in project counts)", async () => {
		const { target } = await authorize("category", "read", {
			type: "category",
			id: w.category.id,
		});
		expect(target).toMatchObject({
			projectId: w.projectA.id,
			timelineId: null,
			ownerId: w.owner.user.id,
			anyGrantInProject: true,
		});
	});

	it("shareLink", async () => {
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });
		const { target } = await authorize("shareLink", "update", { type: "shareLink", id: link.id });
		expect(target).toMatchObject({ timelineId: w.tl1.id, ownerId: w.owner.user.id });
	});

	it.each([
		["org-level", () => ({}), null, null],
		["project", () => ({ projectId: w.projectA.id }), "A", null],
		["timeline (project derived)", () => ({ timelineId: w.tl1.id }), "A", "tl1"],
	] as const)("invitation, %s", async (_, target, project, timeline) => {
		const inv = await f.createInvitation(w.org, { inviter: w.owner.user, ...target() });
		const res = await authorize("invitation", "delete", { type: "invitation", id: inv.id });
		expect(res.target).toMatchObject({
			projectId: project && w.projectA.id,
			timelineId: timeline && w.tl1.id,
			ownerId: w.owner.user.id,
		});
	});

	it("inviteLink on a timeline", async () => {
		const link = await f.createInviteLink(w.org, {
			createdBy: w.owner.user,
			timelineId: w.tl2.id,
		});
		const { target } = await authorize("inviteLink", "delete", { type: "inviteLink", id: link.id });
		expect(target).toMatchObject({ projectId: w.projectA.id, timelineId: w.tl2.id });
	});

	it("grant on a timeline", async () => {
		const m = await f.createMember(w.org, MEMBER);
		const g = await f.grant(m, { timelineId: w.tl2.id }, w.owner.user);
		const { target } = await authorize("grant", "delete", { type: "grant", id: g.id });
		expect(target).toMatchObject({
			organizationId: w.org.id,
			projectId: w.projectA.id,
			timelineId: w.tl2.id,
			ownerId: w.owner.user.id,
		});
	});

	it("member", async () => {
		const m = await f.createMember(w.org, MEMBER);
		const { target } = await authorize("member", "remove", { type: "member", id: m.id });
		expect(target).toEqual({
			organizationId: w.org.id,
			projectId: null,
			timelineId: null,
			ownerId: null,
		});
	});
});

// ─── authorize: grants ──────────────────────────────────────────────────────

describe("authorize with grants (MEMBER)", () => {
	it("404 without any grant (pretends the target doesn't exist)", async () => {
		await as(MEMBER);
		await expectStatus(authorize("project", "read", { type: "project", id: w.projectA.id }), 404);
		await expectStatus(authorize("export", "read", { type: "export", id: w.exp1.id }), 404);
	});

	it("a project grant covers the project, its timelines, exports and markers", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		await authorize("project", "rename", { type: "project", id: w.projectA.id });
		await authorize("timeline", "delete", { type: "timeline", id: w.tl2.id });
		await authorize("export", "upload", { type: "export", id: w.exp1.id });
		await authorize("marker", "update", { type: "marker", id: w.marker1.id });
	});

	it("a project grant covers timelines created later", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		const later = await f.createTimeline(w.projectA);
		await authorize("timeline", "rename", { type: "timeline", id: later.id });
	});

	it("a project grant does not cover another project", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		await expectStatus(authorize("project", "read", { type: "project", id: w.projectB.id }), 404);
		await expectStatus(authorize("export", "read", { type: "export", id: w.expB.id }), 404);
	});

	it("a timeline grant covers that timeline only", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id });
		await authorize("timeline", "rename", { type: "timeline", id: w.tl1.id });
		await authorize("export", "read", { type: "export", id: w.exp1.id });
		await authorize("marker", "delete", { type: "marker", id: w.marker1.id });
		await expectStatus(authorize("timeline", "read", { type: "timeline", id: w.tl2.id }), 404);
		await expectStatus(authorize("export", "read", { type: "export", id: w.exp2.id }), 404);
	});

	it("a timeline grant lets you read (navigate into) the project, nothing more", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id });
		await authorize("project", "read", { type: "project", id: w.projectA.id });
		// can read the project, so it's 403, not 404
		await expectStatus(
			authorize("timeline", "create", { type: "project", id: w.projectA.id }),
			403,
		);
	});

	// canSee() checks `read` with the loose grant rule of a real read (isLoose)
	it("a timeline grant → 403 (not 404) for project actions beyond read", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id });
		await expectStatus(authorize("project", "rename", { type: "project", id: w.projectA.id }), 403);
		await expectStatus(authorize("project", "delete", { type: "project", id: w.projectA.id }), 403);
	});

	it("a timeline grant in another project still → 404", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id }); // tl1 is in projectA
		await expectStatus(authorize("project", "rename", { type: "project", id: w.projectB.id }), 404);
	});

	it("a reviewer with a timeline grant → 403 for project rename", async () => {
		const m = await as(REVIEWER);
		await f.grant(m, { timelineId: w.tl1.id });
		await expectStatus(authorize("project", "rename", { type: "project", id: w.projectA.id }), 403);
	});

	it("a timeline grant is enough for project categories (read and create)", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id });
		await authorize("category", "read", { type: "category", id: w.category.id });
		await authorize("category", "update", { type: "category", id: w.category.id });
		await authorize("category", "create", { type: "project", id: w.projectA.id });
	});

	it("a grant in another org's project never helps", async () => {
		// Grants are per member, so this checks the member lookup is org-scoped
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		await expectStatus(
			authorize("project", "read", { type: "project", id: w.otherProject.id }),
			404,
		);
	});

	it("can create a top-level project without any grant", async () => {
		await as(MEMBER);
		await authorize("project", "create", { type: "organization", id: w.org.id });
	});

	it("org-level targets are never covered by a grant", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		const inv = await f.createInvitation(w.org, { inviter: m.user });
		await expectStatus(authorize("invitation", "delete", { type: "invitation", id: inv.id }), 404);
	});

	it("MEMBER cannot load other members via authorize", async () => {
		await as(MEMBER);
		await expectStatus(authorize("member", "read", { type: "member", id: w.owner.id }), 404);
	});
});

// ─── authorize: own-only rules ──────────────────────────────────────────────

describe("authorize own-only rules", () => {
	it("REVIEWER may update own markers, gets 403 on others' (can see them)", async () => {
		const r = await as(REVIEWER);
		await f.grant(r, { timelineId: w.tl1.id });
		const mine = await f.createMarker(w.exp1, w.category, { author: r.user });
		await authorize("marker", "update", { type: "marker", id: mine.id });
		await authorize("marker", "delete", { type: "marker", id: mine.id });
		await expectStatus(authorize("marker", "update", { type: "marker", id: w.marker1.id }), 403);
	});

	it("a marker without author is nobody's own", async () => {
		const r = await as(REVIEWER);
		await f.grant(r, { timelineId: w.tl1.id });
		const orphan = await f.createMarker(w.exp1, w.category);
		await expectStatus(authorize("marker", "delete", { type: "marker", id: orphan.id }), 403);
	});

	it("own marker still needs a grant", async () => {
		const r = await as(REVIEWER);
		const mine = await f.createMarker(w.exp2, w.category, { author: r.user });
		await expectStatus(authorize("marker", "update", { type: "marker", id: mine.id }), 404);
	});

	it("REVIEWER may not create exports or invitations: 403 where visible", async () => {
		const r = await as(REVIEWER);
		await f.grant(r, { projectId: w.projectA.id });
		await expectStatus(authorize("export", "upload", { type: "export", id: w.exp1.id }), 403);
		await expectStatus(authorize("project", "create", { type: "organization", id: w.org.id }), 403);
	});

	it("MEMBER may delete own invitation on a granted project, not someone else's", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		const mine = await f.createInvitation(w.org, { inviter: m.user, projectId: w.projectA.id });
		const theirs = await f.createInvitation(w.org, {
			inviter: w.owner.user,
			timelineId: w.tl1.id,
		});
		await authorize("invitation", "delete", { type: "invitation", id: mine.id });
		await expectStatus(
			authorize("invitation", "delete", { type: "invitation", id: theirs.id }),
			403,
		);
	});

	it("MEMBER may delete grants they created, ADMIN any", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		const colleague = await f.createMember(w.org, REVIEWER);
		const mine = await f.grant(colleague, { timelineId: w.tl1.id }, m.user);
		const theirs = await f.grant(colleague, { timelineId: w.tl2.id }, w.owner.user);
		await authorize("grant", "delete", { type: "grant", id: mine.id });
		// grant has no read action → being a member is enough to get 403
		await expectStatus(authorize("grant", "delete", { type: "grant", id: theirs.id }), 403);

		await as(ADMIN);
		await authorize("grant", "delete", { type: "grant", id: theirs.id });
	});

	it("only the owner may delete the organization", async () => {
		await as(ADMIN);
		await expectStatus(
			authorize("organization", "delete", { type: "organization", id: w.org.id }),
			403,
		);
		signIn(w.owner.user, w.org.id);
		await authorize("organization", "delete", { type: "organization", id: w.org.id });
	});
});

// ─── authorizeMarkers ───────────────────────────────────────────────────────

describe("authorizeMarkers", () => {
	it("400 for an empty list", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(authorizeMarkers("delete", w.exp1.id, []), 400);
	});

	it("400 for more than 500 distinct ids", async () => {
		signIn(w.owner.user, w.org.id);
		const ids = Array.from({ length: 501 }, (_, i) => `m${i}`);
		await expectStatus(authorizeMarkers("delete", w.exp1.id, ids), 400);
	});

	it("de-duplicates ids before counting", async () => {
		signIn(w.owner.user, w.org.id);
		const ids = Array.from({ length: 600 }, () => w.marker1.id);
		const { markers } = await authorizeMarkers("delete", w.exp1.id, ids);
		expect(markers).toHaveLength(1);
	});

	it("404 when a marker belongs to another export", async () => {
		signIn(w.owner.user, w.org.id);
		const elsewhere = await f.createMarker(w.exp2, w.category);
		await expectStatus(authorizeMarkers("delete", w.exp1.id, [w.marker1.id, elsewhere.id]), 404);
	});

	it("404 without read access to the export", async () => {
		await as(MEMBER);
		await expectStatus(authorizeMarkers("update", w.exp1.id, [w.marker1.id]), 404);
	});

	it("REVIEWER: only if every marker is their own", async () => {
		const r = await as(REVIEWER);
		await f.grant(r, { timelineId: w.tl1.id });
		const a = await f.createMarker(w.exp1, w.category, { author: r.user });
		const b = await f.createMarker(w.exp1, w.category, { author: r.user });
		await authorizeMarkers("delete", w.exp1.id, [a.id, b.id]);
		await expectStatus(authorizeMarkers("delete", w.exp1.id, [a.id, w.marker1.id]), 403);
	});

	it("MEMBER with grant may update anyone's markers", async () => {
		const m = await as(MEMBER);
		await f.grant(m, { timelineId: w.tl1.id });
		const { markers } = await authorizeMarkers("update", w.exp1.id, [w.marker1.id]);
		expect(markers.map((x) => x.id)).toEqual([w.marker1.id]);
	});
});

// ─── requireMediaAccess ─────────────────────────────────────────────────────

describe("requireMediaAccess", () => {
	it("404 for unknown media", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(requireMediaAccess("nope"), 404);
	});

	it("follows read access on the export", async () => {
		const m = await as(REVIEWER);
		await expectStatus(requireMediaAccess(w.exp1.mediaId!), 404);
		await f.grant(m, { timelineId: w.tl1.id });
		const { target } = await requireMediaAccess(w.exp1.mediaId!);
		expect(target.timelineId).toBe(w.tl1.id);
	});
});

// ─── Members ────────────────────────────────────────────────────────────────

describe("getActiveMember", () => {
	it("null when signed out", async () => {
		signOut();
		expect(await getActiveMember()).toBeNull();
	});

	it("null without an active org", async () => {
		signIn(w.owner.user, null);
		expect(await getActiveMember()).toBeNull();
	});

	it("null when the active org is one the user is not in", async () => {
		signIn(w.owner.user, w.other.id);
		expect(await getActiveMember()).toBeNull();
	});

	it("the membership in the active org", async () => {
		signIn(w.owner.user, w.org.id);
		expect((await getActiveMember())?.id).toBe(w.owner.id);
	});
});

describe("requireOrgRole", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(requireOrgRole(w.org.id, REVIEWER), 401);
	});

	it("404 for non-members", async () => {
		signIn(w.otherOwner.user, w.org.id);
		await expectStatus(requireOrgRole(w.org.id, REVIEWER), 404);
	});

	it("403 below the required role, member at or above", async () => {
		const m = await as(MEMBER);
		await expectStatus(requireOrgRole(w.org.id, ADMIN), 403);
		expect((await requireOrgRole(w.org.id, MEMBER)).id).toBe(m.id);
		expect((await requireOrgRole(w.org.id, REVIEWER)).id).toBe(m.id);
	});
});

// ─── List filters ───────────────────────────────────────────────────────────

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("accessible* list filters", () => {
	it.each([OWNER, ADMIN])("%s sees everything in the org and nothing outside", async (role) => {
		const m = await f.createMember(w.org, role);
		expect(ids(await prisma.project.findMany({ where: accessibleProjects(m) }))).toEqual(
			ids([w.projectA, w.projectB]),
		);
		expect(ids(await prisma.timeline.findMany({ where: accessibleTimelines(m) }))).toEqual(
			ids([w.tl1, w.tl2, w.tlB]),
		);
		expect(ids(await prisma.export.findMany({ where: accessibleExports(m) }))).toEqual(
			ids([w.exp1, w.exp2, w.expB]),
		);
	});

	it.each([MEMBER, REVIEWER])("%s without grants sees nothing", async (role) => {
		const m = await f.createMember(w.org, role);
		expect(await prisma.project.findMany({ where: accessibleProjects(m) })).toEqual([]);
		expect(await prisma.timeline.findMany({ where: accessibleTimelines(m) })).toEqual([]);
		expect(await prisma.export.findMany({ where: accessibleExports(m) })).toEqual([]);
	});

	it("project grant → that project with all its timelines and exports", async () => {
		const m = await f.createMember(w.org, MEMBER);
		await f.grant(m, { projectId: w.projectA.id });
		expect(ids(await prisma.project.findMany({ where: accessibleProjects(m) }))).toEqual(
			ids([w.projectA]),
		);
		expect(ids(await prisma.timeline.findMany({ where: accessibleTimelines(m) }))).toEqual(
			ids([w.tl1, w.tl2]),
		);
		expect(ids(await prisma.export.findMany({ where: accessibleExports(m) }))).toEqual(
			ids([w.exp1, w.exp2]),
		);
	});

	it("timeline grant → its project is listed, but only that timeline", async () => {
		const m = await f.createMember(w.org, REVIEWER);
		await f.grant(m, { timelineId: w.tl2.id });
		expect(ids(await prisma.project.findMany({ where: accessibleProjects(m) }))).toEqual(
			ids([w.projectA]),
		);
		expect(ids(await prisma.timeline.findMany({ where: accessibleTimelines(m) }))).toEqual(
			ids([w.tl2]),
		);
		expect(ids(await prisma.export.findMany({ where: accessibleExports(m) }))).toEqual(
			ids([w.exp2]),
		);
	});

	it("another member's grants don't leak", async () => {
		const m = await f.createMember(w.org, MEMBER);
		const colleague = await f.createMember(w.org, MEMBER);
		await f.grant(colleague, { projectId: w.projectB.id });
		expect(await prisma.project.findMany({ where: accessibleProjects(m) })).toEqual([]);
	});
});

// ─── accessChecker must agree with authorize ────────────────────────────────

describe("accessChecker", () => {
	async function agrees(
		area: Parameters<typeof authorize>[0],
		action: string,
		target: Parameters<typeof authorize>[2],
		t: Parameters<Awaited<ReturnType<typeof accessChecker>>>[2],
		member: Awaited<ReturnType<typeof f.createMember>>,
	) {
		const check = await accessChecker(member);
		const fast = check(area, action as never, t);
		const slow = await authorize(area, action as never, target).then(
			() => true,
			() => false,
		);
		expect(fast, `${area}.${action} on ${target.type}`).toBe(slow);
	}

	it.each([OWNER, ADMIN, MEMBER, REVIEWER])("matches authorize for %s", async (role) => {
		const m = await as(role);
		await f.grant(m, { timelineId: w.tl1.id });
		const mine = await f.createMarker(w.exp1, w.category, { author: m.user });

		const pA = { projectId: w.projectA.id, ownerId: w.projectA.creatorId };
		await agrees(
			"project",
			"read",
			{ type: "project", id: w.projectA.id },
			{ ...pA, loose: true },
			m,
		);
		await agrees("project", "rename", { type: "project", id: w.projectA.id }, pA, m);
		await agrees(
			"project",
			"read",
			{ type: "project", id: w.projectB.id },
			{ projectId: w.projectB.id, loose: true },
			m,
		);

		const t1 = { projectId: w.projectA.id, timelineId: w.tl1.id };
		const t2 = { projectId: w.projectA.id, timelineId: w.tl2.id };
		await agrees("timeline", "rename", { type: "timeline", id: w.tl1.id }, t1, m);
		await agrees("timeline", "rename", { type: "timeline", id: w.tl2.id }, t2, m);
		await agrees("export", "upload", { type: "export", id: w.exp1.id }, t1, m);

		await agrees(
			"marker",
			"update",
			{ type: "marker", id: mine.id },
			{ ...t1, ownerId: m.userId },
			m,
		);
		await agrees(
			"marker",
			"update",
			{ type: "marker", id: w.marker1.id },
			{ ...t1, ownerId: w.owner.userId },
			m,
		);

		await agrees(
			"category",
			"update",
			{ type: "category", id: w.category.id },
			{ projectId: w.projectA.id, ownerId: w.category.createdById, loose: true },
			m,
		);
		await agrees(
			"organization",
			"updateSettings",
			{ type: "organization", id: w.org.id },
			{ projectId: null },
			m,
		);
	});
});
