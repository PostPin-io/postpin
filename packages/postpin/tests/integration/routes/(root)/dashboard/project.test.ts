import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { getProjects } from "../../../../../src/routes/(root)/dashboard/project.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

type Result = Awaited<ReturnType<typeof getProjects>>;
const shape = (res: Result) =>
	Object.fromEntries(res.projects.map((p) => [p.id, p.timelines.map((t) => t.id).sort()]));

describe("getProjects", () => {
	it("nothing when signed out", async () => {
		signOut();
		expect(await getProjects()).toEqual({ canCreate: false, projects: [] });
	});

	it("nothing without an active org, or with an org the user isn't in", async () => {
		signIn(w.owner.user, null);
		expect(await getProjects()).toEqual({ canCreate: false, projects: [] });
		signIn(w.owner.user, w.other.id);
		expect(await getProjects()).toEqual({ canCreate: false, projects: [] });
	});

	it.each([OWNER, ADMIN])(
		"%s sees every project of the active org, none of another",
		async (role) => {
			await signInAs(w.org, role);
			const res = await getProjects();
			expect(shape(res)).toEqual({
				[w.projectA.id]: [w.tl1.id, w.tl2.id].sort(),
				[w.projectB.id]: [w.tlB.id],
			});
			expect(res.canCreate).toBe(true);
			expect(res.projects.every((p) => p.canRename && p.canDelete)).toBe(true);
		},
	);

	it.each([MEMBER, REVIEWER])("%s without grants sees nothing", async (role) => {
		await signInAs(w.org, role);
		expect((await getProjects()).projects).toEqual([]);
	});

	it("a member with a project grant sees that project with all timelines", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		const res = await getProjects();
		expect(shape(res)).toEqual({ [w.projectA.id]: [w.tl1.id, w.tl2.id].sort() });
		expect(res.canCreate).toBe(true);
		expect(res.projects.map((p) => [p.canRename, p.canDelete])).toEqual([[true, true]]);
	});

	it("a timeline grant lists the project with only that timeline, without project rights", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const res = await getProjects();
		expect(shape(res)).toEqual({ [w.projectA.id]: [w.tl1.id] });
		expect(res.projects.map((p) => [p.canRename, p.canDelete])).toEqual([[false, false]]);
	});

	it("a reviewer may not create, rename or delete projects", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		const res = await getProjects();
		expect(res.canCreate).toBe(false);
		expect(res.projects.map((p) => [p.canRename, p.canDelete])).toEqual([[false, false]]);
	});

	it("each timeline carries only its newest export", async () => {
		await prisma.export.update({ where: { id: w.exp1.id }, data: { createdAt: new Date(1000) } });
		await prisma.export.update({ where: { id: w.exp1b.id }, data: { createdAt: new Date(2000) } });
		signIn(w.owner.user, w.org.id);
		const res = await getProjects();
		const tl1 = res.projects.flatMap((p) => p.timelines).find((t) => t.id === w.tl1.id)!;
		expect(tl1.exports.map((e) => e.id)).toEqual([w.exp1b.id]);
	});
});
