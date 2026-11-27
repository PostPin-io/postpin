import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	clearMarkerClipboard,
	createMarker,
	deleteMarkers,
	getMarkerClipboard,
	pasteMarkers,
	redoMarkers,
	setMarkerClipboard,
	undoMarkers,
	updateMarker,
	updateMarkers,
} from "#lib/components/review/markers/markers.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { fakeCookies } from "../../../../../helpers/cookies.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn, useCookies } from "../../../../../helpers/request-event.ts";

const { MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const tl1Grant = () => ({ timelineId: w.tl1.id });
const undo = (force?: boolean) => undoMarkers({ force });
const redo = (force?: boolean) => redoMarkers({ force });
const markersOf = (exportId: string) =>
	prisma.marker.findMany({ where: { exportId }, orderBy: { frame: "asc" } });

async function markerWithExtras(frame = 10) {
	const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user, frame });
	await prisma.response.create({
		data: { markerId: m.id, content: "reply", authorId: w.owner.user.id },
	});
	await prisma.markerPointer.create({
		data: { markerId: m.id, kind: "ARROW", x: 0.5, y: 0.5, color: "red" },
	});
	return m;
}

const edit = (m: { id: string; name: string; categoryId: string }, over: object) =>
	updateMarker({
		id: m.id,
		name: m.name,
		description: "",
		frame: 0,
		categoryId: m.categoryId,
		...over,
	});

describe("undo and redo", () => {
	it("nothing to undo or redo", async () => {
		signIn(w.owner.user, w.org.id);
		expect(await undo()).toEqual({ status: "empty" });
		expect(await redo()).toEqual({ status: "empty" });
	});

	it("brings deleted markers back with their ids, responses and pointers, and deletes them again", async () => {
		const a = await markerWithExtras(10);
		const b = await f.createMarker(w.exp1, w.catA, { frame: 20 });
		signIn(w.owner.user, w.org.id);
		await deleteMarkers({ exportId: w.exp1.id, ids: [a.id, b.id] });
		expect(await markersOf(w.exp1.id)).toEqual([]);

		expect(await undo()).toMatchObject({ status: "done", label: "Delete 2 markers" });
		expect((await markersOf(w.exp1.id)).map((m) => m.id)).toEqual([a.id, b.id]);
		expect(await prisma.response.count({ where: { markerId: a.id } })).toBe(1);
		expect(await prisma.markerPointer.count({ where: { markerId: a.id } })).toBe(1);
		// They exist again: the plugins don't take them for deleted
		expect(await prisma.deletedMarker.count()).toBe(0);

		expect(await redo()).toMatchObject({ status: "done" });
		expect(await markersOf(w.exp1.id)).toEqual([]);
	});

	it("takes back a move, and does it again", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		signIn(w.owner.user, w.org.id);
		await edit(m, { frame: 50 });

		await undo();
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).frame).toBe(10);
		await redo();
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).frame).toBe(50);
	});

	it("undoes the newest step first, across exports", async () => {
		signIn(w.owner.user, w.org.id);
		const input = { name: "", description: "", frame: 5, categoryId: w.catA.id };
		await createMarker({ ...input, exportId: w.exp1.id });
		await createMarker({ ...input, exportId: w.exp1b.id });

		expect(await undo()).toMatchObject({ exports: [expect.objectContaining({ id: w.exp1b.id })] });
		expect(await prisma.marker.count({ where: { exportId: w.exp1b.id } })).toBe(0);
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(1);
		expect(await undo()).toMatchObject({
			exports: [
				expect.objectContaining({ id: w.exp1.id, href: expect.stringContaining(w.exp1.id) }),
			],
		});
		expect(await prisma.marker.count()).toBe(0);
	});

	it("typing a title is one step", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await edit(m, { name: "Cu" });
		await edit(m, { name: "Cut here" });
		expect(await prisma.markerUndoStep.count()).toBe(1);

		await undo();
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).name).toBe(m.name);
	});

	it("an edit that changes nothing leaves no step", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await edit(m, {});
		expect(await prisma.markerUndoStep.count()).toBe(0);
	});

	it("a new action ends the redo", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		signIn(w.owner.user, w.org.id);
		await edit(m, { frame: 20 });
		await undo();
		await edit(m, { frame: 30 });
		expect(await redo()).toEqual({ status: "empty" });
	});

	it("each user has their own history", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		signIn(w.owner.user, w.org.id);
		await edit(m, { frame: 20 });
		await signInAs(w.org, MEMBER, [tl1Grant()]);
		expect(await undo()).toEqual({ status: "empty" });
	});

	it("a batch edit is one step", async () => {
		const a = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		const b = await f.createMarker(w.exp1, w.catA, { frame: 20 });
		const other = await f.createCategory(w.projectA);
		signIn(w.owner.user, w.org.id);
		await updateMarkers({ exportId: w.exp1.id, ids: [a.id, b.id], categoryId: other.id, shift: 5 });

		expect(await undo()).toMatchObject({ label: "Edit 2 markers" });
		expect((await markersOf(w.exp1.id)).map((m) => [m.frame, m.categoryId])).toEqual([
			[10, w.catA.id],
			[20, w.catA.id],
		]);
	});
});

describe("conflicts", () => {
	it("asks before overwriting someone else's change, and goes ahead with force", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		signIn(w.owner.user, w.org.id);
		await edit(m, { frame: 20 });
		// meanwhile someone else
		await prisma.marker.update({ where: { id: m.id }, data: { name: "Changed" } });

		expect(await undo()).toMatchObject({ status: "conflict", count: 1 });
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).frame).toBe(20);

		expect(await undo(true)).toMatchObject({ status: "done" });
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).frame).toBe(10);
	});

	it("a response added since doesn't stop moving a marker back, but deleting it", async () => {
		signIn(w.owner.user, w.org.id);
		const created = await createMarker({
			name: "",
			description: "",
			frame: 5,
			categoryId: w.catA.id,
			exportId: w.exp1.id,
		});
		await prisma.response.create({
			data: { markerId: created.id, content: "seen", authorId: w.owner.user.id },
		});
		// undoing the create would delete the response
		expect(await undo()).toMatchObject({ status: "conflict" });
	});
});

describe("access", () => {
	it("a reviewer undoes the deletion of their own markers", async () => {
		const me = await signInAs(w.org, REVIEWER, [tl1Grant()]);
		const mine = await f.createMarker(w.exp1, w.catA, { author: me.user });
		await deleteMarkers({ exportId: w.exp1.id, ids: [mine.id] });
		expect(await undo()).toMatchObject({ status: "done" });
		expect(await prisma.marker.count({ where: { id: mine.id } })).toBe(1);
	});

	it("a step whose rights are gone is dropped, nothing changes", async () => {
		const me = await signInAs(w.org, MEMBER, [tl1Grant()]);
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await deleteMarkers({ exportId: w.exp1.id, ids: [theirs.id] });
		await prisma.member.update({ where: { id: me.id }, data: { role: REVIEWER } });

		expect(await undo()).toMatchObject({ status: "expired" });
		expect(await prisma.marker.count()).toBe(0);
		expect(await prisma.markerUndoStep.count()).toBe(0);
	});

	it("401 when signed out", async () => {
		await expectStatus(undo(), 401);
	});
});

describe("NLE links", () => {
	async function syncedMarker() {
		const m = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		return prisma.marker.update({
			where: { id: m.id },
			data: { nleId: "nle-1", nleTimelineId: "tl-a", syncHash: "hash" },
		});
	}

	it("a marker still in the NLE keeps its link when it comes back", async () => {
		const m = await syncedMarker();
		signIn(w.owner.user, w.org.id);
		await deleteMarkers({ exportId: w.exp1.id, ids: [m.id] });
		await undo();
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
			nleId: "nle-1",
			nleTimelineId: "tl-a",
			syncHash: "hash",
		});
	});

	it("a marker a pull removed from the NLE comes back unlinked, so the next pull adds it", async () => {
		const m = await syncedMarker();
		signIn(w.owner.user, w.org.id);
		await deleteMarkers({ exportId: w.exp1.id, ids: [m.id] });
		// what linkMarkers' forgetDeleted does after the pull removed it from the NLE
		await prisma.deletedMarker.deleteMany({ where: { markerId: m.id } });
		await undo();
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
			nleId: null,
			nleTimelineId: null,
			syncHash: null,
		});
	});
});

describe("paste", () => {
	const paste = (markerIds: string[], over: object = {}) =>
		pasteMarkers({
			sourceExportId: w.exp1.id,
			targetExportId: w.exp1b.id,
			anchorFrame: 100,
			fallbackCategoryId: w.catA.id,
			mode: "copy",
			markerIds,
			...over,
		});

	it("undoing a copy removes the copies, redo brings the same ones back", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await paste([a.id]);
		const [copy] = await markersOf(w.exp1b.id);

		await undo();
		expect(await markersOf(w.exp1b.id)).toEqual([]);
		await redo();
		expect((await markersOf(w.exp1b.id)).map((m) => m.id)).toEqual([copy!.id]);
	});

	it("cut moves the markers themselves; a synced one leaves the source's NLE timeline", async () => {
		const a = await markerWithExtras(10);
		await prisma.marker.update({
			where: { id: a.id },
			data: { nleId: "nle-1", nleTimelineId: "tl-a", syncHash: "hash" },
		});
		signIn(w.owner.user, w.org.id);
		await paste([a.id], { mode: "cut" });

		expect(await prisma.marker.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
			exportId: w.exp1b.id,
			frame: 100,
			nleId: null,
		});
		expect(await prisma.response.count({ where: { markerId: a.id } })).toBe(1);
		expect(
			await prisma.deletedMarker.findUniqueOrThrow({ where: { markerId: a.id } }),
		).toMatchObject({ exportId: w.exp1.id, nleId: "nle-1" });

		// back where it was, linked again: no pull ran in between
		await undo();
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
			exportId: w.exp1.id,
			frame: 10,
			nleId: "nle-1",
			nleTimelineId: "tl-a",
		});
		expect(await prisma.deletedMarker.count()).toBe(0);
	});

	it("cut within the export keeps the NLE link", async () => {
		const a = await f.createMarker(w.exp1, w.catA, { frame: 10 });
		await prisma.marker.update({ where: { id: a.id }, data: { nleId: "nle-1" } });
		signIn(w.owner.user, w.org.id);
		await paste([a.id], { mode: "cut", targetExportId: w.exp1.id });
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
			frame: 100,
			nleId: "nle-1",
		});
	});

	it("pasting a cut empties the clipboard", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await setMarkerClipboard({ sourceExportId: w.exp1.id, markerIds: [a.id], mode: "cut" });
		await paste([a.id], { mode: "cut" });
		expect(await getMarkerClipboard("")).toBeNull();
	});
});

describe("clipboard", () => {
	it("is the user's, in every window", async () => {
		const a = await f.createMarker(w.exp1, w.catA);
		signIn(w.owner.user, w.org.id);
		await setMarkerClipboard({ sourceExportId: w.exp1.id, markerIds: [a.id, a.id], mode: "copy" });
		expect(await getMarkerClipboard("")).toEqual({
			sourceExportId: w.exp1.id,
			markerIds: [a.id],
			mode: "copy",
		});

		await signInAs(w.org, MEMBER, [tl1Grant()]);
		expect(await getMarkerClipboard("")).toBeNull();

		signIn(w.owner.user, w.org.id);
		await clearMarkerClipboard({});
		expect(await getMarkerClipboard("")).toBeNull();
	});

	it("404 for an export the user can't read", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(
			setMarkerClipboard({ sourceExportId: w.exp1.id, markerIds: ["x"], mode: "copy" }),
			404,
		);
	});
});

describe("guests", () => {
	async function guestWorld() {
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });
		const jar = fakeCookies().cookies;
		const guest = await createShareGuest(jar, link, "Anna");
		useCookies(jar);
		const shareToken = link.token;
		const add = (frame: number) =>
			createMarker({ exportId: w.exp1.id, name: "", description: "", frame, shareToken });
		return { link, guest, shareToken, add };
	}

	it("undo and redo their own actions", async () => {
		const { shareToken, add } = await guestWorld();
		const m = await add(10);
		await deleteMarkers({ exportId: w.exp1.id, ids: [m.id], shareToken });

		expect(await undoMarkers({ shareToken })).toMatchObject({ status: "done" });
		expect(await prisma.marker.count({ where: { id: m.id } })).toBe(1);
		expect(await undoMarkers({ shareToken })).toMatchObject({ status: "done" });
		expect(await prisma.marker.count()).toBe(0);
		expect(await redoMarkers({ shareToken })).toMatchObject({ status: "done" });
		expect(await prisma.marker.count()).toBe(1);
	});

	it("copy and paste their own markers within the link's export", async () => {
		const { guest, shareToken, add } = await guestWorld();
		const m = await add(10);
		const theirs = await f.createMarker(w.exp1, w.catA, { author: w.owner.user, frame: 20 });

		await setMarkerClipboard({
			sourceExportId: w.exp1.id,
			markerIds: [m.id, theirs.id],
			mode: "copy",
			shareToken,
		});
		const res = await pasteMarkers({
			sourceExportId: w.exp1.id,
			targetExportId: w.exp1.id,
			markerIds: [m.id, theirs.id],
			anchorFrame: 40,
			mode: "copy",
			shareToken,
		});
		// someone else's marker is skipped
		expect(res).toEqual({ count: 1, skipped: 1 });
		const copies = await prisma.marker.findMany({ where: { guestId: guest.id, frame: 40 } });
		expect(copies).toHaveLength(1);
	});

	it("never paste into another export", async () => {
		const { shareToken, add } = await guestWorld();
		const m = await add(10);
		await expectStatus(
			pasteMarkers({
				sourceExportId: w.exp1.id,
				targetExportId: w.exp1b.id,
				markerIds: [m.id],
				anchorFrame: 0,
				mode: "copy",
				shareToken,
			}),
			404,
		);
	});

	it("have a history apart from the signed-in user's", async () => {
		const { shareToken, add } = await guestWorld();
		signIn(w.owner.user, w.org.id);
		await add(10);
		expect(await undoMarkers({})).toEqual({ status: "empty" });
		expect(await undoMarkers({ shareToken })).toMatchObject({ status: "done" });
	});
});
