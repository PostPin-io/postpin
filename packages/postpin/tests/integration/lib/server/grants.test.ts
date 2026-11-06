import type { Prisma } from "@postpin-io/shared/db";
import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { createGrant, joinWithAccess } from "#lib/server/grants.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

async function world() {
	const org = await f.createOrg();
	const owner = await f.createMember(org, OWNER);
	const member = await f.createMember(org, MEMBER);
	const projectA = await f.createProject(org);
	const projectB = await f.createProject(org);
	const tl1 = await f.createTimeline(projectA);
	const tl2 = await f.createTimeline(projectA);
	const tlB = await f.createTimeline(projectB);
	return { org, owner, member, projectA, projectB, tl1, tl2, tlB };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

const grantsOf = async (memberId: string) =>
	(await prisma.memberGrant.findMany({ where: { memberId } }))
		.map((g) => g.projectId ?? g.timelineId)
		.sort();

const inTx = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

// ─── createGrant ────────────────────────────────────────────────────────────

describe("createGrant", () => {
	it("creates a project grant with its creator", async () => {
		await inTx((tx) =>
			createGrant(tx, {
				memberId: w.member.id,
				projectId: w.projectA.id,
				createdById: w.owner.user.id,
			}),
		);
		const [g] = await prisma.memberGrant.findMany({ where: { memberId: w.member.id } });
		expect(g).toMatchObject({
			projectId: w.projectA.id,
			timelineId: null,
			createdById: w.owner.user.id,
		});
	});

	it("a project grant removes timeline grants inside it, not elsewhere", async () => {
		await f.grant(w.member, { timelineId: w.tl1.id });
		await f.grant(w.member, { timelineId: w.tl2.id });
		await f.grant(w.member, { timelineId: w.tlB.id });

		await inTx((tx) =>
			createGrant(tx, { memberId: w.member.id, projectId: w.projectA.id, createdById: null }),
		);

		expect(await grantsOf(w.member.id)).toEqual([w.projectA.id, w.tlB.id].sort());
	});

	it("leaves other members' timeline grants alone", async () => {
		const colleague = await f.createMember(w.org, REVIEWER);
		await f.grant(colleague, { timelineId: w.tl1.id });
		await inTx((tx) =>
			createGrant(tx, { memberId: w.member.id, projectId: w.projectA.id, createdById: null }),
		);
		expect(await grantsOf(colleague.id)).toEqual([w.tl1.id]);
	});

	it("a timeline grant is skipped when the project is already granted", async () => {
		await f.grant(w.member, { projectId: w.projectA.id });
		await inTx((tx) =>
			createGrant(tx, { memberId: w.member.id, timelineId: w.tl1.id, createdById: null }),
		);
		expect(await grantsOf(w.member.id)).toEqual([w.projectA.id]);
	});

	it("a project grant on another project doesn't cover the timeline", async () => {
		await f.grant(w.member, { projectId: w.projectB.id });
		await inTx((tx) =>
			createGrant(tx, { memberId: w.member.id, timelineId: w.tl1.id, createdById: null }),
		);
		expect(await grantsOf(w.member.id)).toEqual([w.projectB.id, w.tl1.id].sort());
	});

	it("is idempotent and keeps the original creator", async () => {
		for (const by of [w.owner.user.id, w.member.user.id]) {
			await inTx(async (tx) => {
				await createGrant(tx, { memberId: w.member.id, projectId: w.projectB.id, createdById: by });
				await createGrant(tx, { memberId: w.member.id, timelineId: w.tl1.id, createdById: by });
			});
		}
		const grants = await prisma.memberGrant.findMany({ where: { memberId: w.member.id } });
		expect(grants).toHaveLength(2);
		expect(grants.every((g) => g.createdById === w.owner.user.id)).toBe(true);
	});

	it("throws for an unknown timeline", async () => {
		await expect(
			inTx((tx) =>
				createGrant(tx, { memberId: w.member.id, timelineId: "nope", createdById: null }),
			),
		).rejects.toThrow();
	});
});

// ─── joinWithAccess ─────────────────────────────────────────────────────────

describe("joinWithAccess", () => {
	const join = (
		userId: string,
		extra: Partial<{ role: Role; projectId: string; timelineId: string; createdById: string }> = {},
	) =>
		inTx((tx) =>
			joinWithAccess(tx, {
				organizationId: w.org.id,
				userId,
				role: extra.role ?? MEMBER,
				projectId: extra.projectId ?? null,
				timelineId: extra.timelineId ?? null,
				createdById: extra.createdById ?? null,
			}),
		);

	it("creates the membership with the given role", async () => {
		const u = await f.createUser();
		const m = await join(u.id, { role: REVIEWER });
		expect(m).toMatchObject({ organizationId: w.org.id, userId: u.id, role: REVIEWER });
		expect(await grantsOf(m.id)).toEqual([]);
	});

	it("grants the project, with createdById", async () => {
		const u = await f.createUser();
		const m = await join(u.id, { projectId: w.projectA.id, createdById: w.owner.user.id });
		const grants = await prisma.memberGrant.findMany({ where: { memberId: m.id } });
		expect(grants).toMatchObject([{ projectId: w.projectA.id, createdById: w.owner.user.id }]);
	});

	it("grants the timeline", async () => {
		const u = await f.createUser();
		const m = await join(u.id, { timelineId: w.tl1.id });
		expect(await grantsOf(m.id)).toEqual([w.tl1.id]);
	});

	it("existing member keeps their role and membership", async () => {
		const m = await join(w.member.user.id, { role: ADMIN, projectId: w.projectA.id });
		expect(m.id).toBe(w.member.id);
		expect(m.role).toBe(MEMBER);
		expect(await grantsOf(m.id)).toEqual([w.projectA.id]);
	});

	it.each([ADMIN, OWNER])("new %s gets no grant", async (role) => {
		const u = await f.createUser();
		const m = await join(u.id, { role, projectId: w.projectA.id });
		expect(await grantsOf(m.id)).toEqual([]);
	});

	it("existing owner gets no grant", async () => {
		const m = await join(w.owner.user.id, { projectId: w.projectA.id });
		expect(m.role).toBe(OWNER);
		expect(await grantsOf(m.id)).toEqual([]);
	});

	it("rolls back the membership when the grant fails", async () => {
		const u = await f.createUser();
		await expect(join(u.id, { timelineId: "nope" })).rejects.toThrow();
		expect(await prisma.member.count({ where: { userId: u.id } })).toBe(0);
	});
});
