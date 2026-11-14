import { beforeEach, describe, expect, it } from "vitest";
import {
	GUEST_CATEGORY_NAME,
	guestCategoryFor,
	resolveShareLink,
	shareLinkCategory,
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

describe("guestCategoryFor", () => {
	const guestCategory = (creatorId: string | null = null) =>
		prisma.$transaction((tx) => guestCategoryFor(tx, project.id, creatorId));

	it('creates "Guest" once, owned by the creator', async () => {
		const user = await f.createUser();
		const id = await guestCategory(user.id);
		expect(await guestCategory()).toBe(id);

		expect(await prisma.category.findUniqueOrThrow({ where: { id } })).toMatchObject({
			name: GUEST_CATEGORY_NAME,
			projectId: project.id,
			createdById: user.id,
		});
	});

	it('uses a category the team already called "Guest"', async () => {
		const existing = await prisma.category.create({
			data: { name: GUEST_CATEGORY_NAME, color: "#000000", projectId: project.id },
		});
		expect(await guestCategory()).toBe(existing.id);
	});

	it("creates a new one once the old one is renamed", async () => {
		const id = await guestCategory();
		await prisma.category.update({ where: { id }, data: { name: "Client notes" } });
		expect(await guestCategory()).not.toBe(id);
	});

	it("creates only one under concurrent calls", async () => {
		const ids = await Promise.all([guestCategory(), guestCategory(), guestCategory()]);
		expect(new Set(ids).size).toBe(1);
	});
});

describe("shareLinkCategory", () => {
	const categoryOf = (link: Parameters<typeof shareLinkCategory>[1]) =>
		prisma.$transaction((tx) => shareLinkCategory(tx, link, project.id));

	it("the link's category", async () => {
		const category = await f.createCategory(project);
		const link = await prisma.shareLink.update({
			where: { id: (await f.createShareLink(exp)).id },
			data: { categoryId: category.id },
		});
		expect(await categoryOf(link)).toBe(category.id);
		expect(await prisma.category.count()).toBe(1);
	});

	it('without one: "Guest", which the link keeps', async () => {
		const link = await f.createShareLink(exp);
		const id = await categoryOf(link);
		expect(await prisma.category.findUniqueOrThrow({ where: { id } })).toMatchObject({
			name: GUEST_CATEGORY_NAME,
		});
		expect(await prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } })).toMatchObject({
			categoryId: id,
		});
	});
});
