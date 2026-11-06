import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	addGrant,
	getMemberGrants,
	getTargetAccess,
	removeGrant,
} from "#lib/components/sharing/grants.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

/**
 * Org with owner, admin, a member granted project A, and an ungranted reviewer.
 * Project A has two timelines. A second org exists to test isolation.
 */
async function world() {
	const org = await f.createOrg();
	const other = await f.createOrg();

	const owner = await f.createMember(org, OWNER);
	const admin = await f.createMember(org, ADMIN);
	const member = await f.createMember(org, MEMBER);
	const reviewer = await f.createMember(org, REVIEWER);

	const projectA = await f.createProject(org, { name: "Alpha" });
	const projectB = await f.createProject(org, { name: "Beta" });
	const tl1 = await f.createTimeline(projectA, { name: "Cut 1" });
	const tl2 = await f.createTimeline(projectA, { name: "Cut 2" });
	const tlB = await f.createTimeline(projectB);

	await f.grant(member, { projectId: projectA.id }, owner.user);

	const otherOwner = await f.createMember(other, OWNER);
	const otherMember = await f.createMember(other, MEMBER);
	const otherProject = await f.createProject(other);
	const otherTimeline = await f.createTimeline(otherProject);

	return {
		org,
		other,
		owner,
		admin,
		member,
		reviewer,
		projectA,
		projectB,
		tl1,
		tl2,
		tlB,
		otherOwner,
		otherMember,
		otherProject,
		otherTimeline,
	};
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

const as = (m: { user: { id: string; email: string; name: string } }, orgId = w.org.id) =>
	signIn(m.user, orgId);

const grantsOf = (memberId: string) =>
	prisma.memberGrant.findMany({ where: { memberId }, orderBy: { createdAt: "asc" } });

const project = (p: { id: string }) => ({ type: "project" as const, id: p.id });
const timeline = (t: { id: string }) => ({ type: "timeline" as const, id: t.id });

// ─── addGrant ───────────────────────────────────────────────────────────────

describe("addGrant", () => {
	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(addGrant({ memberId: w.reviewer.id, target: project(w.projectA) }), 401);
	});

	it("admin grants a project", async () => {
		as(w.admin);
		await addGrant({ memberId: w.reviewer.id, target: project(w.projectA) });
		const grants = await grantsOf(w.reviewer.id);
		expect(grants).toHaveLength(1);
		expect(grants[0]).toMatchObject({
			projectId: w.projectA.id,
			timelineId: null,
			createdById: w.admin.user.id,
		});
	});

	it("admin grants a timeline", async () => {
		as(w.admin);
		await addGrant({ memberId: w.reviewer.id, target: timeline(w.tl1) });
		expect(await grantsOf(w.reviewer.id)).toMatchObject([
			{ timelineId: w.tl1.id, projectId: null },
		]);
	});

	it("a project grant replaces timeline grants inside that project only", async () => {
		await f.grant(w.reviewer, { timelineId: w.tl1.id });
		await f.grant(w.reviewer, { timelineId: w.tl2.id });
		await f.grant(w.reviewer, { timelineId: w.tlB.id });

		as(w.admin);
		await addGrant({ memberId: w.reviewer.id, target: project(w.projectA) });

		const grants = await grantsOf(w.reviewer.id);
		expect(grants.map((g) => g.projectId ?? g.timelineId).sort()).toEqual(
			[w.projectA.id, w.tlB.id].sort(),
		);
	});

	it("is idempotent", async () => {
		as(w.admin);
		await addGrant({ memberId: w.reviewer.id, target: project(w.projectA) });
		await addGrant({ memberId: w.reviewer.id, target: project(w.projectA) });
		await addGrant({ memberId: w.reviewer.id, target: timeline(w.tlB) });
		await addGrant({ memberId: w.reviewer.id, target: timeline(w.tlB) });
		expect(await grantsOf(w.reviewer.id)).toHaveLength(2);
	});

	it("400 for a timeline the grantee already has through its project", async () => {
		as(w.admin);
		await expectStatus(addGrant({ memberId: w.member.id, target: timeline(w.tl1) }), 400);
		expect(await grantsOf(w.member.id)).toHaveLength(1);
	});

	it.each([OWNER, ADMIN])("400 for a grantee who is %s", async (role) => {
		const grantee = await f.createMember(w.org, role);
		as(w.owner);
		await expectStatus(addGrant({ memberId: grantee.id, target: project(w.projectA) }), 400);
		expect(await grantsOf(grantee.id)).toHaveLength(0);
	});

	it("member with a project grant may grant it and its timelines to colleagues", async () => {
		as(w.member);
		await addGrant({ memberId: w.reviewer.id, target: timeline(w.tl2) });
		expect(await grantsOf(w.reviewer.id)).toMatchObject([
			{ timelineId: w.tl2.id, createdById: w.member.user.id },
		]);
	});

	it("member cannot grant a project they have no grant on", async () => {
		as(w.member);
		await expectStatus(addGrant({ memberId: w.reviewer.id, target: project(w.projectB) }), 404);
		await expectStatus(addGrant({ memberId: w.reviewer.id, target: timeline(w.tlB) }), 404);
		expect(await grantsOf(w.reviewer.id)).toHaveLength(0);
	});

	it("member with only a timeline grant cannot grant the whole project", async () => {
		await f.grant(w.reviewer, { timelineId: w.tl1.id });
		await prisma.member.update({ where: { id: w.reviewer.id }, data: { role: MEMBER } });
		const grantee = await f.createMember(w.org, REVIEWER);
		as(w.reviewer);
		// can see the project via the timeline grant → 403, not 404
		await expectStatus(addGrant({ memberId: grantee.id, target: project(w.projectA) }), 403);
		// but the timeline itself is fine
		await addGrant({ memberId: grantee.id, target: timeline(w.tl1) });
		expect(await grantsOf(grantee.id)).toMatchObject([{ timelineId: w.tl1.id }]);
	});

	it("reviewer cannot grant", async () => {
		await f.grant(w.reviewer, { projectId: w.projectA.id });
		const grantee = await f.createMember(w.org, REVIEWER);
		as(w.reviewer);
		await expectStatus(addGrant({ memberId: grantee.id, target: project(w.projectA) }), 403);
	});

	it("404 for a grantee of another org", async () => {
		as(w.owner);
		await expectStatus(addGrant({ memberId: w.otherMember.id, target: project(w.projectA) }), 404);
		expect(await grantsOf(w.otherMember.id)).toHaveLength(0);
	});

	it("404 for a target in another org, also for a grantee there", async () => {
		as(w.owner);
		await expectStatus(addGrant({ memberId: w.reviewer.id, target: project(w.otherProject) }), 404);
		await expectStatus(
			addGrant({ memberId: w.otherMember.id, target: timeline(w.otherTimeline) }),
			404,
		);
		expect(await prisma.memberGrant.count()).toBe(1);
	});

	it("404 for an unknown member", async () => {
		as(w.owner);
		await expectStatus(addGrant({ memberId: "nope", target: project(w.projectA) }), 404);
	});

	it("400 for an export target", async () => {
		as(w.owner);
		await expectStatus(
			addGrant({ memberId: w.reviewer.id, target: { type: "export", id: "x" } as never }),
			400,
		);
	});
});

// ─── removeGrant ────────────────────────────────────────────────────────────

describe("removeGrant", () => {
	it("admin removes any grant", async () => {
		const g = await f.grant(w.reviewer, { projectId: w.projectA.id }, w.member.user);
		as(w.admin);
		await removeGrant(g.id);
		expect(await grantsOf(w.reviewer.id)).toHaveLength(0);
	});

	it("member removes a grant they created", async () => {
		const g = await f.grant(w.reviewer, { timelineId: w.tl1.id }, w.member.user);
		as(w.member);
		await removeGrant(g.id);
		expect(await grantsOf(w.reviewer.id)).toHaveLength(0);
	});

	it("member cannot remove a grant someone else created", async () => {
		const g = await f.grant(w.reviewer, { timelineId: w.tl1.id }, w.admin.user);
		as(w.member);
		await expectStatus(removeGrant(g.id), 403);
		expect(await grantsOf(w.reviewer.id)).toHaveLength(1);
	});

	it("member cannot remove a grant they created outside their own grants", async () => {
		const g = await f.grant(w.reviewer, { projectId: w.projectB.id }, w.member.user);
		as(w.member);
		await expectStatus(removeGrant(g.id), 403);
		expect(await grantsOf(w.reviewer.id)).toHaveLength(1);
	});

	it("404 for a grant in another org", async () => {
		const g = await f.grant(w.otherMember, { projectId: w.otherProject.id });
		as(w.owner);
		await expectStatus(removeGrant(g.id), 404);
		expect(await grantsOf(w.otherMember.id)).toHaveLength(1);
	});

	it("404 for an unknown grant", async () => {
		as(w.owner);
		await expectStatus(removeGrant("nope"), 404);
	});
});

// ─── getTargetAccess ────────────────────────────────────────────────────────

describe("getTargetAccess", () => {
	it("project: lists direct grants and non-manager candidates without a grant", async () => {
		as(w.owner);
		const res = await getTargetAccess(project(w.projectA));

		expect(res.grants).toHaveLength(1);
		expect(res.grants[0].member.id).toBe(w.member.id);
		expect(res.grants[0].canDelete).toBe(true);
		expect(res.inherited).toEqual([]);
		expect(res.candidates.map((m) => m.id)).toEqual([w.reviewer.id]);
	});

	it("timeline: project grants count as inherited and are no candidates", async () => {
		await f.grant(w.reviewer, { timelineId: w.tl1.id });
		const extra = await f.createMember(w.org, REVIEWER);

		as(w.admin);
		const res = await getTargetAccess(timeline(w.tl1));

		expect(res.grants.map((g) => g.member.id)).toEqual([w.reviewer.id]);
		expect(res.inherited.map((g) => g.member.id)).toEqual([w.member.id]);
		expect(res.candidates.map((m) => m.id)).toEqual([extra.id]);
	});

	it("member: canDelete only for grants they created", async () => {
		const mine = await f.grant(w.reviewer, { timelineId: w.tl1.id }, w.member.user);
		const extra = await f.createMember(w.org, REVIEWER);
		const theirs = await f.grant(extra, { timelineId: w.tl1.id }, w.admin.user);

		as(w.member);
		const res = await getTargetAccess(timeline(w.tl1));
		expect(res.grants.find((g) => g.id === mine.id)!.canDelete).toBe(true);
		expect(res.grants.find((g) => g.id === theirs.id)!.canDelete).toBe(false);
	});

	it("member without a grant gets 404, reviewer with one 403", async () => {
		as(w.member);
		await expectStatus(getTargetAccess(project(w.projectB)), 404);

		await f.grant(w.reviewer, { projectId: w.projectB.id });
		as(w.reviewer);
		await expectStatus(getTargetAccess(project(w.projectB)), 403);
	});

	it("404 for a target of another org", async () => {
		as(w.owner);
		await expectStatus(getTargetAccess(project(w.otherProject)), 404);
	});

	it("never lists members of another org as candidates", async () => {
		as(w.owner);
		const res = await getTargetAccess(project(w.projectB));
		const ids = res.candidates.map((m) => m.id);
		expect(ids).not.toContain(w.otherMember.id);
		expect(ids.sort()).toEqual([w.member.id, w.reviewer.id].sort());
	});
});

// ─── getMemberGrants ────────────────────────────────────────────────────────

describe("getMemberGrants", () => {
	it("admin sees every grant with a label", async () => {
		await f.grant(w.reviewer, { projectId: w.projectB.id });
		await f.grant(w.reviewer, { timelineId: w.tl1.id });

		as(w.admin);
		const res = await getMemberGrants(w.reviewer.id);
		// same createdAt is possible, so compare without order
		expect(res.map(({ label, kind, canDelete }) => ({ label, kind, canDelete }))).toEqual(
			expect.arrayContaining([
				{ label: "Beta", kind: "project", canDelete: true },
				{ label: "Alpha › Cut 1", kind: "timeline", canDelete: true },
			]),
		);
		expect(res).toHaveLength(2);
	});

	it("member sees only grants inside what they can access, deletable only when own", async () => {
		const own = await f.grant(w.reviewer, { timelineId: w.tl1.id }, w.member.user);
		const foreign = await f.grant(w.reviewer, { timelineId: w.tl2.id }, w.admin.user);
		await f.grant(w.reviewer, { projectId: w.projectB.id }, w.admin.user);

		as(w.member);
		const res = await getMemberGrants(w.reviewer.id);
		expect(res.map((g) => g.id).sort()).toEqual([own.id, foreign.id].sort());
		expect(res.find((g) => g.id === own.id)!.canDelete).toBe(true);
		expect(res.find((g) => g.id === foreign.id)!.canDelete).toBe(false);
	});

	it("reviewer may look but not delete", async () => {
		await f.grant(w.reviewer, { projectId: w.projectA.id });
		as(w.reviewer);
		const res = await getMemberGrants(w.member.id);
		expect(res).toHaveLength(1);
		expect(res[0].canDelete).toBe(false);
	});

	it("404 for a member of another org", async () => {
		await f.grant(w.otherMember, { projectId: w.otherProject.id });
		as(w.owner);
		await expectStatus(getMemberGrants(w.otherMember.id), 404);
	});

	it("404 for an unknown member, 401 when signed out", async () => {
		as(w.owner);
		await expectStatus(getMemberGrants("nope"), 404);
		signOut();
		await expectStatus(getMemberGrants(w.member.id), 401);
	});
});
