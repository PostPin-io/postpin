import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { CategoryController } from "../../../../src/api/controllers/CategoryController.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { expectHttpError, signInApi } from "../../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../../helpers/api-world.ts";
import { signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ApiWorld;
const controller = new CategoryController();

beforeEach(async () => {
	w = await apiWorld();
});

describe("getCategories", () => {
	it("lists the project's categories only", async () => {
		const second = await f.createCategory(w.projectA);
		await f.createCategory(w.projectB);
		await signInApi(w.owner.user, w.org.id);
		const categories = await controller.getCategories(w.projectA.id);
		expect(categories.map((c) => c.id).sort()).toEqual([w.category.id, second.id].sort());
	});

	it.each([MEMBER, REVIEWER])(
		"%s with only a timeline grant in the project may read",
		async (role) => {
			await signInAs(w, role, { timelineId: w.tl2.id });
			expect((await controller.getCategories(w.projectA.id)).map((c) => c.id)).toEqual([
				w.category.id,
			]);
		},
	);

	it("404 without any grant in the project", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectB.id });
		await expectHttpError(controller.getCategories(w.projectA.id), 404);
	});

	it("404 for another org's project", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(controller.getCategories(w.otherProject.id), 404);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(controller.getCategories(w.projectA.id), 401);
	});
});

describe("createCategory", () => {
	it.each([OWNER, ADMIN])("%s creates a category with an upper-case color", async (role) => {
		const me = await signInAs(w, role);
		const category = await controller.createCategory(w.projectA.id, {
			name: "Sound",
			color: "#a1b2c3",
		});
		expect(category).toMatchObject({
			projectId: w.projectA.id,
			name: "Sound",
			color: "#A1B2C3",
			createdById: me.userId,
		});
		expect(await prisma.category.count({ where: { id: category.id } })).toBe(1);
	});

	it.each([MEMBER, REVIEWER])("%s with a timeline grant may create", async (role) => {
		const me = await signInAs(w, role, { timelineId: w.tl1.id });
		const category = await controller.createCategory(w.projectA.id, {
			name: "VFX",
			color: "#000000",
		});
		expect(category.createdById).toBe(me.userId);
	});

	it.each([MEMBER, REVIEWER])("%s without a grant gets 404", async (role) => {
		await signInAs(w, role, { projectId: w.projectB.id });
		await expectHttpError(
			controller.createCategory(w.projectA.id, { name: "X", color: "#000000" }),
			404,
		);
	});

	it("404 for another org's project", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.createCategory(w.otherProject.id, { name: "X", color: "#000000" }),
			404,
		);
		expect(await prisma.category.count({ where: { projectId: w.otherProject.id } })).toBe(1);
	});

	it.each(["red", "#fff", "#12345G", "#1234567", "112233", " #112233"])(
		"400 for color %j",
		async (color) => {
			await signInApi(w.owner.user, w.org.id);
			await expectHttpError(controller.createCategory(w.projectA.id, { name: "X", color }), 400);
		},
	);

	it("409 when the project already has a category with that name", async () => {
		await signInApi(w.owner.user, w.org.id);
		const err = await expectHttpError(
			controller.createCategory(w.projectA.id, { name: w.category.name, color: "#000000" }),
			409,
		);
		expect(err.message).toContain(w.category.name);
	});

	it("the same name is fine in another project", async () => {
		await signInApi(w.owner.user, w.org.id);
		const c = await controller.createCategory(w.projectB.id, {
			name: w.category.name,
			color: "#000000",
		});
		expect(c.projectId).toBe(w.projectB.id);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(
			controller.createCategory(w.projectA.id, { name: "X", color: "#000000" }),
			401,
		);
	});
});
