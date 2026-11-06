import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { ProjectController } from "../../../../src/api/controllers/ProjectController.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { expectHttpError, hapiRequest, signInApi } from "../../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../../helpers/api-world.ts";
import { signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ApiWorld;
const controller = new ProjectController();

beforeEach(async () => {
	w = await apiWorld();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("getProjects", () => {
	it.each([OWNER, ADMIN])(
		"%s sees every project of the org, with the org attached",
		async (role) => {
			await signInAs(w, role);
			const projects = await controller.getProjects(hapiRequest());
			expect(ids(projects)).toEqual(ids([w.projectA, w.projectB]));
			expect(projects[0]!.organization).toEqual({ id: w.org.id, name: w.org.name });
		},
	);

	it("orders projects by updatedAt, newest first", async () => {
		await prisma.project.update({ where: { id: w.projectA.id }, data: { name: "touched" } });
		await signInApi(w.owner.user, w.org.id);
		const projects = await controller.getProjects(hapiRequest());
		expect(projects.map((p) => p.id)).toEqual([w.projectA.id, w.projectB.id]);
	});

	it.each([MEMBER, REVIEWER])("%s without grants sees nothing", async (role) => {
		await signInAs(w, role);
		expect(await controller.getProjects(hapiRequest())).toEqual([]);
	});

	it("a project grant shows that project only", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectB.id });
		expect(ids(await controller.getProjects(hapiRequest()))).toEqual([w.projectB.id]);
	});

	it("a timeline grant shows the timeline's project", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl2.id });
		expect(ids(await controller.getProjects(hapiRequest()))).toEqual([w.projectA.id]);
	});

	it("lists projects of all the user's orgs, not just the active one", async () => {
		const m = await f.createMember(w.other, ADMIN, w.owner.user);
		await signInApi(m.user, w.org.id);
		expect(ids(await controller.getProjects(hapiRequest()))).toEqual(
			ids([w.projectA, w.projectB, w.otherProject]),
		);
	});

	it("never shows projects of orgs the user is not in", async () => {
		await signInApi(w.otherOwner.user, w.other.id);
		expect(ids(await controller.getProjects(hapiRequest()))).toEqual([w.otherProject.id]);
	});

	it("is empty for a user without memberships", async () => {
		const loner = await f.createUser();
		await signInApi(loner);
		expect(await controller.getProjects(hapiRequest())).toEqual([]);
	});
});

describe("getProject", () => {
	it("owner gets the project with all its timelines", async () => {
		await signInApi(w.owner.user, w.org.id);
		const project = await controller.getProject(w.projectA.id);
		expect(project).toMatchObject({ id: w.projectA.id, name: w.projectA.name, nleProjectId: null });
		expect(ids(project.timelines)).toEqual(ids([w.tl1, w.tl2]));
	});

	it("a timeline grant shows only the granted timeline", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const project = await controller.getProject(w.projectA.id);
		expect(ids(project.timelines)).toEqual([w.tl1.id]);
	});

	it("a project grant also covers timelines created later", async () => {
		await signInAs(w, REVIEWER, { projectId: w.projectA.id });
		const later = await f.createTimeline(w.projectA);
		const project = await controller.getProject(w.projectA.id);
		expect(ids(project.timelines)).toEqual(ids([w.tl1, w.tl2, later]));
	});

	it.each([MEMBER, REVIEWER])("%s without a grant gets 404", async (role) => {
		await signInAs(w, role, { projectId: w.projectB.id });
		await expectHttpError(controller.getProject(w.projectA.id), 404);
	});

	it("404 for a project of another org, even for an owner", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(controller.getProject(w.otherProject.id), 404);
	});

	it("404 for a project that doesn't exist", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(controller.getProject("nope"), 404);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(controller.getProject(w.projectA.id), 401);
	});
});
