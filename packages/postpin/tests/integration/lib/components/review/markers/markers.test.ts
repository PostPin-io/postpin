import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	changeCategoryColor,
	changeDescription,
	createCategory,
	createMarker,
	createResponse,
	deleteCategory,
	deleteMarker,
	deleteMarkers,
	getCategories,
	getCategoryUsage,
	getMarkers,
	getMarkersbyCategory,
	getResponses,
	moveMarker,
	pasteMarkers,
	renameCategory,
	updateMarker,
} from "#lib/components/review/markers/markers.remote.ts";
import { ensureGuestCategory } from "#lib/server/share-links.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const projectGrant = () => ({ projectId: w.projectA.id });
const tl1Grant = () => ({ timelineId: w.tl1.id });

const markerInput = (over: Partial<Parameters<typeof createMarker>[0]> = {}) => ({
	name: "Cut here",
	description: "too long",
	frame: 10,
	exportId: w.exp1.id,
	categoryId: w.catA.id,
	...over,
});

// ─── getMarkers ─────────────────────────────────────────────────────────────

describe("getMarkers", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getMarkers(w.exp1.id), 401);
	});

	it("404 for an unknown export", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getMarkers("nope"), 404);
	});

	it("404 for an owner of another org", async () => {
		signIn(w.otherOwner.user, w.org.id);
		await expectStatus(getMarkers(w.exp1.id), 404);
	});

	it.each([MEMBER, REVIEWER])("404 for a %s without a grant", async (role) => {
		await signInAs(w.org, role);
		await expectStatus(getMarkers(w.exp1.id), 404);
	});

	it("a timeline grant covers that timeline only", async () => {
		await signInAs(w.org, REVIEWER, [tl1Grant()]);
		await expect(getMarkers(w.exp1.id)).resolves.toEqual([]);
		await expectStatus(getMarkers(w.exp2.id), 404);
	});

	it("returns only markers of the export, newest frame first, with responses", async () => {
		const m1 = await f.createMarker(w.exp1, w.catA, { author: w.owner.user, frame: 5 });
		const m2 = await f.createMarker(w.exp1, w.catA, { author: w.owner.user, frame: 50 });
		await f.createMarker(w.exp1b, w.catA, { author: w.owner.user });
		await prisma.response.create({
			data: { markerId: m1.id, content: "ok", authorId: w.owner.user.id },
		});
		signIn(w.owner.user, w.org.id);

		const markers = await getMarkers(w.exp1.id);
		expect(markers.map((m) => m.id)).toEqual([m2.id, m1.id]);
		expect(markers[1]!.responses).toEqual([
			expect.objectContaining({ content: "ok", authorId: w.owner.user.id }),
		]);
		expect(markers[0]!.category.id).toBe(w.catA.id);
	});

	it("a reviewer may only update / delete their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [projectGrant()]);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user, frame: 2 });
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user, frame: 1 });
		const orphan = await f.createMarker(w.exp1, w.catA, { frame: 0 });

		const flags = Object.fromEntries(
			(await getMarkers(w.exp1.id)).map((m) => [m.id, [m.canUpdate, m.canDelete]]),
		);
		expect(flags).toEqual({
			[mine.id]: [true, true],
			[theirs.id]: [false, false],
			[orphan.id]: [false, false],
		});
	});

	it.each([OWNER, ADMIN, MEMBER])("a %s may update / delete every marker", async (role) => {
		await signInAs(w.org, role, role === MEMBER ? [tl1Grant()] : []);
		await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await f.createMarker(w.exp1, w.catA);
		const markers = await getMarkers(w.exp1.id);
		expect(markers.every((m) => m.canUpdate && m.canDelete)).toBe(true);
	});
});

// ─── getMarkersbyCategory ───────────────────────────────────────────────────

describe("getMarkersbyCategory", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getMarkersbyCategory(w.catA.id), 401);
	});

	it("404 for a category of another org", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getMarkersbyCategory(w.otherCat.id), 404);
	});

	it("404 for a member without any grant in the project", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectB.id }]);
		await expectStatus(getMarkersbyCategory(w.catA.id), 404);
	});

	it("only returns markers from exports the user can access", async () => {
		const m1 = await f.createMarker(w.exp1, w.catA);
		const m2 = await f.createMarker(w.exp2, w.catA);
		await signInAs(w.org, REVIEWER, [tl1Grant()]);
		expect((await getMarkersbyCategory(w.catA.id)).map((m) => m.id)).toEqual([m1.id]);

		signIn(w.owner.user, w.org.id);
		expect((await getMarkersbyCategory(w.catA.id)).map((m) => m.id).sort()).toEqual(
			[m1.id, m2.id].sort(),
		);
	});
});

// ─── createMarker ───────────────────────────────────────────────────────────

describe("createMarker", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(createMarker(markerInput()), 401);
	});

	it.each([OWNER, ADMIN, MEMBER, REVIEWER])(
		"a %s with access creates a marker as author",
		async (role) => {
			const me = await signInAs(w.org, role, [tl1Grant()]);
			const marker = await createMarker(markerInput());
			expect(await prisma.marker.findUniqueOrThrow({ where: { id: marker.id } })).toMatchObject({
				name: "Cut here",
				description: "too long",
				frame: 10,
				exportId: w.exp1.id,
				categoryId: w.catA.id,
				authorId: me.user.id,
			});
		},
	);

	it("404 without a grant on the export's timeline", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl2.id }]);
		await expectStatus(createMarker(markerInput()), 404);
		expect(await prisma.marker.count()).toBe(0);
	});

	it("404 for an export in another org", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createMarker(markerInput({ exportId: w.otherExp.id })), 404);
	});

	it.each([
		["another project", () => w.catB.id],
		["another org", () => w.otherCat.id],
		["nowhere", () => "nope"],
	])("404 for a category from %s", async (_, cat) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createMarker(markerInput({ categoryId: cat() })), 404);
		expect(await prisma.marker.count()).toBe(0);
	});

	it.each([
		["a negative frame", { frame: -1 }],
		["a fractional frame", { frame: 1.5 }],
		["a missing name", { name: undefined }],
	])("400 for %s", async (_, over) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createMarker(markerInput(over as never)), 400);
	});
});

// ─── updateMarker / changeDescription / deleteMarker ───────────────────────

describe("updateMarker", () => {
	const input = (id: string, over = {}) => ({
		id,
		name: "renamed",
		description: "new",
		frame: 99,
		categoryId: w.catA.id,
		...over,
	});

	it("a reviewer updates their own marker", async () => {
		const me = await signInAs(w.org, REVIEWER, [projectGrant()]);
		const cat2 = await f.createCategory(w.projectA);
		const m = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await updateMarker(input(m.id, { categoryId: cat2.id }));
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
			name: "renamed",
			description: "new",
			frame: 99,
			categoryId: cat2.id,
		});
	});

	it("403 for a reviewer on someone else's marker", async () => {
		await signInAs(w.org, REVIEWER, [projectGrant()]);
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await expectStatus(updateMarker(input(m.id)), 403);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).name).toBe(m.name);
	});

	it("a member updates someone else's marker", async () => {
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await updateMarker(input(m.id));
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).name).toBe("renamed");
	});

	it("404 for a member without a grant", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		const m = await f.createMarker(w.exp1, w.catA);
		await expectStatus(updateMarker(input(m.id)), 404);
	});

	it("404 when moving into a category of another project", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		await expectStatus(updateMarker(input(m.id, { categoryId: w.catB.id })), 404);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).categoryId).toBe(
			w.catA.id,
		);
	});

	it("404 for a marker of another org", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.otherExp, w.otherCat);
		await expectStatus(updateMarker(input(m.id)), 404);
	});

	it("400 for a negative frame", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		await expectStatus(updateMarker(input(m.id, { frame: -5 })), 400);
	});
});

describe("changeDescription", () => {
	it("a reviewer changes their own marker, not someone else's", async () => {
		const me = await signInAs(w.org, REVIEWER, [projectGrant()]);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });

		await changeDescription({ id: mine.id, description: "mine" });
		await expectStatus(changeDescription({ id: theirs.id, description: "x" }), 403);

		expect((await prisma.marker.findUniqueOrThrow({ where: { id: mine.id } })).description).toBe(
			"mine",
		);
		expect(
			(await prisma.marker.findUniqueOrThrow({ where: { id: theirs.id } })).description,
		).toBeNull();
	});

	it("404 for a marker of another org", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.otherExp, w.otherCat);
		await expectStatus(changeDescription({ id: m.id, description: "x" }), 404);
	});
});

describe("deleteMarker", () => {
	it("a reviewer deletes their own marker", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const m = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await deleteMarker(m.id);
		expect(await prisma.marker.count()).toBe(0);
	});

	it("403 for a reviewer on someone else's (or an orphaned) marker", async () => {
		await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		const orphan = await f.createMarker(w.exp1, w.catA);
		await expectStatus(deleteMarker(theirs.id), 403);
		await expectStatus(deleteMarker(orphan.id), 403);
		expect(await prisma.marker.count()).toBe(2);
	});

	it("a member deletes someone else's marker, responses cascade", async () => {
		await signInAs(w.org, MEMBER, [projectGrant()]);
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await prisma.response.create({ data: { markerId: m.id, content: "x" } });
		await deleteMarker(m.id);
		expect(await prisma.marker.count()).toBe(0);
		expect(await prisma.response.count()).toBe(0);
	});

	it("404 for a marker of another org", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.otherExp, w.otherCat);
		await expectStatus(deleteMarker(m.id), 404);
		expect(await prisma.marker.count()).toBe(1);
	});
});

// ─── deleteMarkers (bulk) ───────────────────────────────────────────────────

describe("deleteMarkers", () => {
	it("400 for an empty list", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids: [] }), 400);
	});

	it("400 for more than 500 ids", async () => {
		signIn(w.owner.user, w.org.id);
		const ids = Array.from({ length: 501 }, (_, i) => `id${i}`);
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids }), 400);
	});

	it("deletes all given markers, duplicates allowed, others untouched", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		const b = await f.createMarker(w.exp1, w.catA);
		const keep = await f.createMarker(w.exp1, w.catA);
		await signInAs(w.org, MEMBER, [tl1Grant()]);

		const res = await deleteMarkers({ exportId: w.exp1.id, ids: [a.id, b.id, a.id] });
		expect(res.count).toBe(2);
		expect((await prisma.marker.findMany()).map((m) => m.id)).toEqual([keep.id]);
	});

	it("404 and deletes nothing when one id belongs to another export", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		const elsewhere = await f.createMarker(w.exp1b, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids: [a.id, elsewhere.id] }), 404);
		expect(await prisma.marker.count()).toBe(2);
	});

	it("404 and deletes nothing when one id belongs to another org", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		const foreign = await f.createMarker(w.otherExp, w.otherCat);
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids: [a.id, foreign.id] }), 404);
		expect(await prisma.marker.count()).toBe(2);
	});

	it("404 when the export is in another org, even with only foreign ids", async () => {
		const foreign = await f.createMarker(w.otherExp, w.otherCat);
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteMarkers({ exportId: w.otherExp.id, ids: [foreign.id] }), 404);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("a reviewer deletes a batch of their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const a = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const b = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await deleteMarkers({ exportId: w.exp1.id, ids: [a.id, b.id] });
		expect(await prisma.marker.count()).toBe(0);
	});

	it("403 and deletes nothing when a reviewer's batch has one foreign marker", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const a = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const b = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids: [a.id, b.id] }), 403);
		expect(await prisma.marker.count()).toBe(2);
	});

	it("404 for a reviewer without a grant", async () => {
		const me = await signInAs(w.org, REVIEWER, [{ timelineId: w.tl2.id }]);
		const a = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await expectStatus(deleteMarkers({ exportId: w.exp1.id, ids: [a.id] }), 404);
		expect(await prisma.marker.count()).toBe(1);
	});
});

// ─── moveMarker (bulk) ──────────────────────────────────────────────────────

describe("moveMarker", () => {
	it("moves markers into the target category", async () => {
		const target = await f.createCategory(w.projectA, { createdBy: w.owner.user });
		const a = await f.createMarker(w.exp1, w.catA);
		const b = await f.createMarker(w.exp1, w.catA);
		await f.createMarker(w.exp2, w.catA); // keeps catA in use
		signIn(w.owner.user, w.org.id);

		const res = await moveMarker({
			exportId: w.exp1.id,
			ids: [a.id, b.id],
			targetCategoryId: target.id,
		});
		expect(res).toEqual({ count: 2, deletedCategoryIds: [] });
		const moved = await prisma.marker.findMany({ where: { id: { in: [a.id, b.id] } } });
		expect(moved.every((m) => m.categoryId === target.id)).toBe(true);
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
	});

	it("keeps the emptied category of a screening while its link works", async () => {
		const screeningCategory = await f.createCategory(w.projectA, { createdBy: w.owner.user });
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await prisma.shareLink.update({
			where: { id: link.id },
			data: { kind: "SCREENING", categoryId: screeningCategory.id },
		});
		const a = await f.createMarker(w.exp1, screeningCategory);
		const b = await f.createMarker(w.exp1, screeningCategory);
		signIn(w.owner.user, w.org.id);
		const move = (id: string) =>
			moveMarker({ exportId: w.exp1.id, ids: [id], targetCategoryId: w.catA.id });

		// guests may still add markers: their category must be there
		await move(a.id);
		expect((await move(b.id)).deletedCategoryIds).toEqual([]);
		expect(await prisma.category.count({ where: { id: screeningCategory.id } })).toBe(1);

		// after the link ended it is a category like any other
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		const c = await f.createMarker(w.exp1, screeningCategory);
		expect((await move(c.id)).deletedCategoryIds).toEqual([screeningCategory.id]);
	});

	it("deletes source categories that end up empty, but only those the user created", async () => {
		const me = await signInAs(w.org, MEMBER, [projectGrant()]);
		const mineCat = await f.createCategory(w.projectA, { createdBy: me.user });
		const target = await f.createCategory(w.projectA);
		const a = await f.createMarker(w.exp1, mineCat);
		const b = await f.createMarker(w.exp1, w.catA); // catA belongs to the owner

		const res = await moveMarker({
			exportId: w.exp1.id,
			ids: [a.id, b.id],
			targetCategoryId: target.id,
		});
		expect(res).toEqual({ count: 2, deletedCategoryIds: [mineCat.id] });
		expect(await prisma.category.count({ where: { id: mineCat.id } })).toBe(0);
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
	});

	it("keeps an own source category that is still used in another export", async () => {
		const me = await signInAs(w.org, MEMBER, [projectGrant()]);
		const mineCat = await f.createCategory(w.projectA, { createdBy: me.user });
		const a = await f.createMarker(w.exp1, mineCat);
		await f.createMarker(w.exp2, mineCat);
		const res = await moveMarker({ exportId: w.exp1.id, ids: [a.id], targetCategoryId: w.catA.id });
		expect(res.deletedCategoryIds).toEqual([]);
		expect(await prisma.category.count({ where: { id: mineCat.id } })).toBe(1);
	});

	it("never deletes the target category", async () => {
		const me = await signInAs(w.org, MEMBER, [projectGrant()]);
		const mineCat = await f.createCategory(w.projectA, { createdBy: me.user });
		const a = await f.createMarker(w.exp1, mineCat);
		const res = await moveMarker({
			exportId: w.exp1.id,
			ids: [a.id],
			targetCategoryId: mineCat.id,
		});
		expect(res).toEqual({ count: 1, deletedCategoryIds: [] });
		expect(await prisma.category.count({ where: { id: mineCat.id } })).toBe(1);
	});

	it.each([
		["another project", () => w.catB.id],
		["another org", () => w.otherCat.id],
	])("404 for a target category from %s, nothing moved", async (_, cat) => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			moveMarker({ exportId: w.exp1.id, ids: [a.id], targetCategoryId: cat() }),
			404,
		);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: a.id } })).categoryId).toBe(
			w.catA.id,
		);
	});

	it("403 for a reviewer moving someone else's marker", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const target = await f.createCategory(w.projectA);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await expectStatus(
			moveMarker({ exportId: w.exp1.id, ids: [mine.id, theirs.id], targetCategoryId: target.id }),
			403,
		);
		expect(await prisma.marker.count({ where: { categoryId: target.id } })).toBe(0);
	});

	it("a reviewer moves their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const target = await f.createCategory(w.projectA);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await moveMarker({ exportId: w.exp1.id, ids: [mine.id], targetCategoryId: target.id });
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: mine.id } })).categoryId).toBe(
			target.id,
		);
	});

	it("400 for an empty list", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			moveMarker({ exportId: w.exp1.id, ids: [], targetCategoryId: w.catA.id }),
			400,
		);
	});

	it("404 when an id belongs to another export", async () => {
		const elsewhere = await f.createMarker(w.exp2, w.catA);
		const target = await f.createCategory(w.projectA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			moveMarker({ exportId: w.exp1.id, ids: [elsewhere.id], targetCategoryId: target.id }),
			404,
		);
		expect(
			(await prisma.marker.findUniqueOrThrow({ where: { id: elsewhere.id } })).categoryId,
		).toBe(w.catA.id);
	});
});

// ─── pasteMarkers ───────────────────────────────────────────────────────────

describe("pasteMarkers", () => {
	const paste = (over: Partial<Parameters<typeof pasteMarkers>[0]> & { markerIds: string[] }) =>
		pasteMarkers({
			sourceExportId: w.exp1.id,
			targetExportId: w.exp1b.id,
			anchorFrame: 100,
			fallbackCategoryId: w.catA.id,
			mode: "copy",
			...over,
		});

	async function sourceMarkers(author: { id: string }) {
		const a = await f.createMarker(w.exp1, w.catA, { author, frame: 20 });
		const b = await f.createMarker(w.exp1, w.catA, { author, frame: 30 });
		await prisma.marker.update({
			where: { id: a.id },
			data: { description: "desc", nleId: "nle-1" },
		});
		await prisma.response.create({
			data: { markerId: a.id, content: "reply", authorId: w.owner.user.id },
		});
		return { a, b };
	}

	it("copy: new markers relative to the anchor, paster is author, responses copied, nleId dropped", async () => {
		const { a, b } = await sourceMarkers(w.owner.user);
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);

		const res = await paste({ markerIds: [a.id, b.id] });
		expect(res).toEqual({ count: 2, skipped: 0 });

		const pasted = await prisma.marker.findMany({
			where: { exportId: w.exp1b.id },
			orderBy: { frame: "asc" },
			include: { responses: true },
		});
		expect(pasted.map((m) => [m.name, m.frame, m.authorId, m.nleId, m.categoryId])).toEqual([
			[a.name, 100, me.user.id, null, w.catA.id],
			[b.name, 110, me.user.id, null, w.catA.id],
		]);
		expect(pasted[0]!.description).toBe("desc");
		expect(pasted[0]!.responses).toEqual([
			expect.objectContaining({ content: "reply", authorId: w.owner.user.id }),
		]);
		// source untouched
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(2);
	});

	it("cut: moves the markers and keeps their author", async () => {
		const { a, b } = await sourceMarkers(w.owner.user);
		await signInAs(w.org, MEMBER, [tl1Grant()]);

		await paste({ markerIds: [a.id, b.id], mode: "cut", anchorFrame: 0 });
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(0);
		const pasted = await prisma.marker.findMany({
			where: { exportId: w.exp1b.id },
			orderBy: { frame: "asc" },
		});
		expect(pasted.map((m) => [m.frame, m.authorId])).toEqual([
			[0, w.owner.user.id],
			[10, w.owner.user.id],
		]);
		expect(await prisma.response.count()).toBe(1);
	});

	it("cut: 403 for a reviewer with a foreign marker, nothing changes", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await expectStatus(paste({ markerIds: [mine.id, theirs.id], mode: "cut" }), 403);
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(2);
		expect(await prisma.marker.count({ where: { exportId: w.exp1b.id } })).toBe(0);
	});

	it("cut: a reviewer moves their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await paste({ markerIds: [mine.id], mode: "cut" });
		expect((await prisma.marker.findMany()).map((m) => [m.exportId, m.authorId])).toEqual([
			[w.exp1b.id, me.user.id],
		]);
	});

	it("cross project: same-named category is reused, others fall back", async () => {
		const named = await f.createCategory(w.projectA);
		const twin = await prisma.category.create({
			data: { name: named.name, color: "#00ff00", projectId: w.projectB.id },
		});
		const a = await f.createMarker(w.exp1, named, { frame: 0 });
		const b = await f.createMarker(w.exp1, w.catA, { frame: 1 });
		signIn(w.owner.user, w.org.id);

		await paste({
			markerIds: [a.id, b.id],
			targetExportId: w.expB.id,
			fallbackCategoryId: w.catB.id,
		});
		const pasted = await prisma.marker.findMany({
			where: { exportId: w.expB.id },
			orderBy: { frame: "asc" },
		});
		expect(pasted.map((m) => m.categoryId)).toEqual([twin.id, w.catB.id]);
	});

	it.each([
		["the source project (target is another project)", () => w.catA.id],
		["another org", () => w.otherCat.id],
	])("404 for a fallback category from %s", async (_, cat) => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			paste({ markerIds: [a.id], targetExportId: w.expB.id, fallbackCategoryId: cat() }),
			404,
		);
		expect(await prisma.marker.count({ where: { exportId: w.expB.id } })).toBe(0);
	});

	it("404 when the user can't read the source export", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(paste({ markerIds: [a.id], targetExportId: w.exp2.id }), 404);
		expect(await prisma.marker.count({ where: { exportId: w.exp2.id } })).toBe(0);
	});

	it("404 when the user can't write the target export", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		await expectStatus(paste({ markerIds: [a.id], targetExportId: w.exp2.id }), 404);
	});

	it("404 for a target export in another org", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			paste({
				markerIds: [a.id],
				targetExportId: w.otherExp.id,
				fallbackCategoryId: w.otherCat.id,
			}),
			404,
		);
		expect(await prisma.marker.count({ where: { exportId: w.otherExp.id } })).toBe(0);
	});

	it("skips ids that are not in the source export", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		const elsewhere = await f.createMarker(w.exp2, w.catA);
		const foreign = await f.createMarker(w.otherExp, w.otherCat);
		signIn(w.owner.user, w.org.id);
		const res = await paste({ markerIds: [a.id, elsewhere.id, foreign.id, "gone"] });
		expect(res).toEqual({ count: 1, skipped: 3 });
		expect(await prisma.marker.count({ where: { exportId: w.exp1b.id } })).toBe(1);
	});

	it("cut does not delete skipped markers from other exports", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		const elsewhere = await f.createMarker(w.exp2, w.catA);
		signIn(w.owner.user, w.org.id);
		await paste({ markerIds: [a.id, elsewhere.id], mode: "cut" });
		expect(await prisma.marker.count({ where: { id: elsewhere.id } })).toBe(1);
	});

	it("404 when none of the markers exist anymore", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(paste({ markerIds: ["gone"] }), 404);
	});

	it.each([
		["no markers", { markerIds: [] }],
		["a negative anchor", { markerIds: ["x"], anchorFrame: -1 }],
		["an unknown mode", { markerIds: ["x"], mode: "move" }],
	])("400 for %s", async (_, over) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(paste(over as never), 400);
	});
});

// ─── Responses ──────────────────────────────────────────────────────────────

describe("responses", () => {
	it("a reviewer responds to someone else's marker; content is trimmed", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		await createResponse({ markerId: m.id, content: "  looks good  " });
		expect(await prisma.response.findMany()).toEqual([
			expect.objectContaining({ markerId: m.id, content: "looks good", authorId: me.user.id }),
		]);
	});

	it("400 for a blank response", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(createResponse({ markerId: m.id, content: "   " }), 400);
		expect(await prisma.response.count()).toBe(0);
	});

	it("404 without a grant, and for markers of another org", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		const foreign = await f.createMarker(w.otherExp, w.otherCat);
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl2.id }]);
		await expectStatus(createResponse({ markerId: m.id, content: "x" }), 404);
		await expectStatus(createResponse({ markerId: foreign.id, content: "x" }), 404);
		await expectStatus(getResponses(m.id), 404);
		expect(await prisma.response.count()).toBe(0);
	});

	it("getResponses lists responses of that marker, oldest first, with author", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		const other = await f.createMarker(w.exp1, w.catA);
		await prisma.response.create({
			data: {
				markerId: m.id,
				content: "second",
				createdAt: new Date(2000),
				authorId: w.owner.user.id,
			},
		});
		await prisma.response.create({
			data: { markerId: m.id, content: "first", createdAt: new Date(1000) },
		});
		await prisma.response.create({ data: { markerId: other.id, content: "elsewhere" } });
		await signInAs(w.org, REVIEWER, [projectGrant()]);

		const res = await getResponses(m.id);
		expect(res.map((r) => r.content)).toEqual(["first", "second"]);
		expect(res[1]!.author).toEqual({ id: w.owner.user.id, name: w.owner.user.name, image: null });
	});

	it("401 when signed out", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		signOut();
		await expectStatus(createResponse({ markerId: m.id, content: "x" }), 401);
	});
});

// ─── Categories ─────────────────────────────────────────────────────────────

describe("getCategories", () => {
	it("a timeline grant is enough to list the project's categories", async () => {
		await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const res = await getCategories(w.projectA.id);
		expect(res.map((c) => c.id)).toEqual([w.catA.id]);
	});

	it("404 without any grant in the project, and for another org", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectB.id }]);
		await expectStatus(getCategories(w.projectA.id), 404);
		await expectStatus(getCategories(w.otherProject.id), 404);
	});

	it("sorted by name; reviewer may only edit own categories", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await prisma.category.create({
			data: { name: "AAA", color: "#000", projectId: w.projectA.id, createdById: me.user.id },
		});
		const res = await getCategories(w.projectA.id);
		expect(res.map((c) => [c.id, c.canUpdate, c.canDelete])).toEqual([
			[mine.id, true, true],
			[w.catA.id, false, false],
		]);
	});

	it("a member with a timeline grant may edit every category", async () => {
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		const res = await getCategories(w.projectA.id);
		expect(res.map((c) => [c.canUpdate, c.canDelete])).toEqual([[true, true]]);
	});
});

describe("createCategory", () => {
	it("a reviewer with a timeline grant creates a category as creator", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const c = await createCategory({ name: "Music", color: "#123456", projectId: w.projectA.id });
		expect(await prisma.category.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
			name: "Music",
			color: "#123456",
			projectId: w.projectA.id,
			createdById: me.user.id,
		});
	});

	it("409 for a duplicate name in the same project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			createCategory({ name: w.catA.name, color: "#000", projectId: w.projectA.id }),
			409,
		);
		// the same name in another project is fine
		await createCategory({ name: w.catA.name, color: "#000", projectId: w.projectB.id });
	});

	it("404 without a grant in the project, and for another org", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectB.id }]);
		await expectStatus(createCategory({ name: "x", color: "#000", projectId: w.projectA.id }), 404);
		await expectStatus(
			createCategory({ name: "x", color: "#000", projectId: w.otherProject.id }),
			404,
		);
		expect(await prisma.category.count({ where: { name: "x" } })).toBe(0);
	});
});

describe("getCategoryUsage", () => {
	it("counts all markers in the project, foreign ones including orphans", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		await f.createMarker(w.exp1, w.catA, { author: me.user });
		await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await f.createMarker(w.exp2, w.catA); // orphan, in a timeline the reviewer can't see
		await f.createMarker(w.expB, w.catB);

		expect(await getCategoryUsage(w.catA.id)).toEqual({
			total: 3,
			foreign: 2,
			canMoveForeign: false,
		});
	});

	it("canMoveForeign is true for a member", async () => {
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		expect(await getCategoryUsage(w.catA.id)).toEqual({
			total: 0,
			foreign: 0,
			canMoveForeign: true,
		});
	});

	it("404 for another org's category", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getCategoryUsage(w.otherCat.id), 404);
	});
});

describe("changeCategoryColor / renameCategory", () => {
	it("a reviewer edits their own category, not someone else's", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createCategory(w.projectA, { createdBy: me.user });

		await changeCategoryColor({ id: mine.id, color: "#abcdef" });
		await renameCategory({ id: mine.id, name: "Renamed", exportId: w.exp1.id });
		expect(await prisma.category.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({
			color: "#abcdef",
			name: "Renamed",
		});

		await expectStatus(changeCategoryColor({ id: w.catA.id, color: "#abcdef" }), 403);
		await expectStatus(renameCategory({ id: w.catA.id, name: "Nope" }), 403);
		expect(await prisma.category.findUniqueOrThrow({ where: { id: w.catA.id } })).toMatchObject({
			color: w.catA.color,
			name: w.catA.name,
		});
	});

	it("a member edits someone else's category", async () => {
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		await renameCategory({ id: w.catA.id, name: "By member" });
		expect((await prisma.category.findUniqueOrThrow({ where: { id: w.catA.id } })).name).toBe(
			"By member",
		);
	});

	it("404 for another org's category", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(changeCategoryColor({ id: w.otherCat.id, color: "#000" }), 404);
		await expectStatus(renameCategory({ id: w.otherCat.id, name: "x" }), 404);
	});

	it("409 when renaming to a name that already exists in the project", async () => {
		const other = await f.createCategory(w.projectA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameCategory({ id: other.id, name: w.catA.name }), 409);
	});
});

describe("deleteCategory", () => {
	it("deletes an unused category", async () => {
		signIn(w.owner.user, w.org.id);
		expect(await deleteCategory({ id: w.catA.id })).toEqual({ success: true });
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(0);
	});

	it("refuses a used category without mergeIntoId", async () => {
		await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		expect(await deleteCategory({ id: w.catA.id })).toEqual({
			success: false,
			reason: "CATEGORY_IN_USE",
		});
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
	});

	it("merges all markers of the project into mergeIntoId, then deletes", async () => {
		const into = await f.createCategory(w.projectA);
		await f.createMarker(w.exp1, w.catA);
		await f.createMarker(w.exp2, w.catA);
		await signInAs(w.org, MEMBER, [tl1Grant()]);

		expect(
			await deleteCategory({ id: w.catA.id, mergeIntoId: into.id, exportId: w.exp1.id }),
		).toEqual({
			success: true,
		});
		expect(await prisma.marker.count({ where: { categoryId: into.id } })).toBe(2);
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(0);
	});

	it("400 when merging into itself", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteCategory({ id: w.catA.id, mergeIntoId: w.catA.id }), 400);
	});

	it.each([
		["another project", () => w.catB.id],
		["another org", () => w.otherCat.id],
	])("404 when merging into a category from %s", async (_, into) => {
		await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteCategory({ id: w.catA.id, mergeIntoId: into() }), 404);
		expect(await prisma.marker.count({ where: { categoryId: w.catA.id } })).toBe(1);
	});

	it("a reviewer can't delete their own category while it holds foreign markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createCategory(w.projectA, { createdBy: me.user });
		await f.createMarker(w.exp1, mine, { author: me.user });
		await f.createMarker(w.exp2, mine); // orphan counts as foreign

		expect(await deleteCategory({ id: mine.id, mergeIntoId: w.catA.id })).toEqual({
			success: false,
			reason: "HAS_FOREIGN_MARKERS",
		});
		expect(await prisma.marker.count({ where: { categoryId: mine.id } })).toBe(2);
	});

	it("a reviewer merges their own category holding only their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createCategory(w.projectA, { createdBy: me.user });
		const m = await f.createMarker(w.exp1, mine, { author: me.user });
		expect(await deleteCategory({ id: mine.id, mergeIntoId: w.catA.id })).toEqual({
			success: true,
		});
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).categoryId).toBe(
			w.catA.id,
		);
	});

	it("403 for a reviewer on someone else's category", async () => {
		await signInAs(w.org, REVIEWER, [tl1Grant()]);
		await expectStatus(deleteCategory({ id: w.catA.id }), 403);
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
	});

	it("404 for another org's category and without a grant", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteCategory({ id: w.otherCat.id }), 404);
		await signInAs(w.org, MEMBER, [{ projectId: w.projectB.id }]);
		await expectStatus(deleteCategory({ id: w.catA.id }), 404);
		expect(await prisma.category.count()).toBe(3);
	});
});
describe("guest category", () => {
	let guestId: string;
	beforeEach(async () => {
		guestId = await prisma.$transaction((tx) => ensureGuestCategory(tx, w.projectA.id));
		signIn(w.owner.user, w.org.id);
	});

	it("can't be deleted", async () => {
		expect(await deleteCategory({ id: guestId })).toEqual({
			success: false,
			reason: "GUEST_CATEGORY",
		});
	});

	it("can't be merged into another", async () => {
		expect(await deleteCategory({ id: guestId, mergeIntoId: w.catA.id })).toMatchObject({
			reason: "GUEST_CATEGORY",
		});
	});

	it("markers can be merged into it", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		expect(await deleteCategory({ id: w.catA.id, mergeIntoId: guestId })).toEqual({
			success: true,
		});
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).categoryId).toBe(
			guestId,
		);
	});

	it("team members can move markers into it", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await moveMarker({ exportId: w.exp1.id, ids: [m.id], targetCategoryId: guestId });
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).categoryId).toBe(
			guestId,
		);
	});

	it("team members can set it when editing a marker", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		const updated = await updateMarker({
			id: m.id,
			name: "Renamed",
			description: "",
			frame: m.frame,
			categoryId: guestId,
		});
		expect(updated).toMatchObject({ name: "Renamed", categoryId: guestId });
	});

	it("is flagged, not deletable and not renamable in getCategories", async () => {
		const guest = (await getCategories(w.projectA.id)).find((c) => c.id === guestId)!;
		expect(guest).toMatchObject({
			isGuest: true,
			canDelete: false,
			canRename: false,
			canUpdate: true,
		});
	});

	it("can't be renamed, but its color can be changed", async () => {
		await expectStatus(renameCategory({ id: guestId, name: "Feedback" }), 403);
		await changeCategoryColor({ id: guestId, color: "#000000" });
		expect(await prisma.category.findUniqueOrThrow({ where: { id: guestId } })).toMatchObject({
			name: "Guest",
			color: "#000000",
		});
	});
});
