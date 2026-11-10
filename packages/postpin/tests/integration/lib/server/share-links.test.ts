import { beforeEach, describe, expect, it } from "vitest";
import {
	GUEST_CATEGORY_NAME,
	ensureGuestCategory,
	resolveShareLink,
} from "#lib/server/share-links.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";

let project: Awaited<ReturnType<typeof f.createProject>>;
let exp: Awaited<ReturnType<typeof f.createExport>>;

beforeEach(async () => {
	project = await f.createProject(await f.createOrg());
	exp = await f.createExport(await f.createTimeline(project));
});

describe("resolveShareLink", () => {
	it("returns an active link with its export", async () => {
		const link = await f.createShareLink(exp);
		expect(await resolveShareLink(link.token)).toMatchObject({
			id: link.id,
			export: { id: exp.id, timeline: { projectId: project.id } },
		});
	});

	it("404 for an unknown token", () => expectStatus(resolveShareLink("nope"), 404));

	it("410 when expired", async () => {
		const link = await f.createShareLink(exp, { expiresAt: new Date(Date.now() - 1000) });
		await expectStatus(resolveShareLink(link.token), 410);
	});

	it("410 when revoked", async () => {
		const link = await f.createShareLink(exp, { revokedAt: new Date() });
		await expectStatus(resolveShareLink(link.token), 410);
	});
});

describe("ensureGuestCategory", () => {
	const ensure = () => prisma.$transaction((tx) => ensureGuestCategory(tx, project.id));

	it("creates it once, unowned, and links it to the project", async () => {
		const id = await ensure();
		expect(await ensure()).toBe(id);

		const category = await prisma.category.findUniqueOrThrow({ where: { id } });
		expect(category).toMatchObject({ name: GUEST_CATEGORY_NAME, createdById: null });
		expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({
			guestCategoryId: id,
		});
	});

	it("adds a suffix when the name is taken", async () => {
		await prisma.category.createMany({
			data: [
				{ name: GUEST_CATEGORY_NAME, color: "#000000", projectId: project.id },
				{ name: `${GUEST_CATEGORY_NAME} (2)`, color: "#000000", projectId: project.id },
			],
		});
		const id = await ensure();
		expect((await prisma.category.findUniqueOrThrow({ where: { id } })).name).toBe(
			`${GUEST_CATEGORY_NAME} (3)`,
		);
	});

	it("creates only one under concurrent calls", async () => {
		const ids = await Promise.all([ensure(), ensure(), ensure()]);
		expect(new Set(ids).size).toBe(1);
	});
});
