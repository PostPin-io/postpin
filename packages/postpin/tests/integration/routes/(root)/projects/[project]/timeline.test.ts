import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { getTimelines } from "../../../../../../src/routes/(root)/projects/[project]/timeline.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import { signIn, signOut } from "../../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const ids = (res: Awaited<ReturnType<typeof getTimelines>>) =>
	res.timelines.map((t) => t.id).sort();

describe("getTimelines", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getTimelines(w.projectA.id), 401);
	});

	it("404 for another org's project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getTimelines(w.otherProject.id), 404);
	});

	it.each([MEMBER, REVIEWER])("404 for a %s with a grant on another project", async (role) => {
		await signInAs(w.org, role, [{ projectId: w.projectB.id }]);
		await expectStatus(getTimelines(w.projectA.id), 404);
	});

	it.each([OWNER, ADMIN])(
		"%s sees all timelines of the project and may do everything",
		async (role) => {
			await signInAs(w.org, role);
			const res = await getTimelines(w.projectA.id);
			expect(ids(res)).toEqual([w.tl1.id, w.tl2.id].sort());
			expect(res.canCreate).toBe(true);
			expect(res.timelines.every((t) => t.canRename && t.canDelete)).toBe(true);
		},
	);

	it("a project grant shows every timeline of the project", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		const res = await getTimelines(w.projectA.id);
		expect(ids(res)).toEqual([w.tl1.id, w.tl2.id].sort());
		expect(res.canCreate).toBe(true);
	});

	it("a timeline grant shows only that timeline and doesn't allow creating new ones", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const res = await getTimelines(w.projectA.id);
		expect(ids(res)).toEqual([w.tl1.id]);
		expect(res.canCreate).toBe(false);
		expect(res.timelines.map((t) => [t.canRename, t.canDelete])).toEqual([[true, true]]);
	});

	it("a reviewer may not create, rename or delete", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		const res = await getTimelines(w.projectA.id);
		expect(res.canCreate).toBe(false);
		expect(res.timelines.every((t) => !t.canRename && !t.canDelete)).toBe(true);
	});

	it("includes only the newest export of each timeline", async () => {
		await prisma.export.update({ where: { id: w.exp1.id }, data: { createdAt: new Date(1000) } });
		await prisma.export.update({ where: { id: w.exp1b.id }, data: { createdAt: new Date(2000) } });
		signIn(w.owner.user, w.org.id);
		const res = await getTimelines(w.projectA.id);
		const tl1 = res.timelines.find((t) => t.id === w.tl1.id)!;
		expect(tl1.exports.map((e) => e.id)).toEqual([w.exp1b.id]);
	});
});
