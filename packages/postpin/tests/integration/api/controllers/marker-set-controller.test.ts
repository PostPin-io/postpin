import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import type { PostPinMarkerSnapshot } from "@postpin-io/shared/logic/marker-sets";
import { MarkerController } from "../../../../src/api/controllers/MarkerController.ts";
import { MarkerSetController } from "../../../../src/api/controllers/MarkerSetController.ts";
import { deleteMarkersRecorded } from "../../../../src/lib/server/marker-sets.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { expectHttpError, expectPluginRoleError } from "../../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../../helpers/api-world.ts";

const { MEMBER, REVIEWER } = Role;

let w: ApiWorld;
const markers = new MarkerController();
const sets = new MarkerSetController();

beforeEach(async () => {
	w = await apiWorld();
});

type Push = Parameters<MarkerController["syncMarkers"]>[3];

const push = (body: Partial<Push>, exportId = w.exp1.id, timelineId = w.tl1.id) =>
	markers.syncMarkers(w.projectA.id, timelineId, exportId, {
		nleTimelineId: "nle-tl",
		nleTimelineName: "Cut 3",
		hostName: "Resolve",
		nleMarkers: [],
		upserts: [],
		deleteIds: [],
		summary: {},
		...body,
	});

const upsert = (data: Partial<Push["upserts"][number]> = {}): Push["upserts"][number] => ({
	name: "From Resolve",
	description: null,
	frame: 100,
	categoryId: w.category.id,
	syncHash: "h",
	...data,
});

const markersOf = (exportId: string) =>
	prisma.marker.findMany({ where: { exportId }, orderBy: { frame: "asc" } });

// ─── syncMarkers (push) ─────────────────────────────────────────────────────

describe("syncMarkers", () => {
	it("backs up both sides, then adds and updates markers with their sync state", async () => {
		const me = await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const result = await push({
			nleMarkers: [
				{ nleId: "n1", title: "Old", description: "", frame: 10, color: "Blue", customData: null },
			],
			upserts: [
				upsert({ id: w.marker1.id, nleId: "n1", name: "Renamed", frame: 10 }),
				upsert({ nleId: "n2", name: "New", frame: 200, syncHash: "h2" }),
			],
			summary: { postpin: { added: 1, updated: 1, removed: 0 } },
		});

		const [renamed, created] = await markersOf(w.exp1.id);
		expect(renamed).toMatchObject({
			id: w.marker1.id,
			name: "Renamed",
			nleId: "n1",
			nleTimelineId: "nle-tl",
			syncHash: "h",
		});
		expect(created).toMatchObject({
			name: "New",
			nleId: "n2",
			syncHash: "h2",
			authorId: me.userId,
		});
		expect(result.markers).toEqual([
			{ id: w.marker1.id, nleId: "n1" },
			{ id: created!.id, nleId: "n2" },
		]);

		// the backup has the state before the push
		const set = await prisma.markerSet.findUniqueOrThrow({ where: { id: result.markerSetId } });
		expect(set).toMatchObject({
			action: "PUSH",
			timelineId: w.tl1.id,
			exportId: w.exp1.id,
			nleTimelineId: "nle-tl",
			createdById: me.userId,
			summary: { postpin: { added: 1, updated: 1, removed: 0 } },
		});
		const before = set.postpinMarkers as unknown as PostPinMarkerSnapshot;
		expect(before.markers.map((m) => [m.id, m.name])).toEqual([[w.marker1.id, w.marker1.name]]);
		expect((set.nleMarkers as { markers: unknown[] }).markers).toHaveLength(1);
	});

	it("deletes the markers the user agreed to, keeps the others", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const other = await f.createMarker(w.exp1, w.category, { frame: 20 });
		await push({ deleteIds: [w.marker1.id] });
		expect((await markersOf(w.exp1.id)).map((m) => m.id)).toEqual([other.id]);
	});

	it("moves an NLE id to the marker it now belongs to", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const pushedCopy = await prisma.marker.create({
			data: { name: "copy", frame: 5, exportId: w.exp1.id, categoryId: w.category.id, nleId: "n1" },
		});
		await push({ upserts: [upsert({ id: w.marker1.id, nleId: "n1" })] });
		const after = await prisma.marker.findMany({
			where: { id: { in: [w.marker1.id, pushedCopy.id] } },
		});
		expect(Object.fromEntries(after.map((m) => [m.id, m.nleId]))).toEqual({
			[w.marker1.id]: "n1",
			[pushedCopy.id]: null,
		});
	});

	it("forgets a deleted marker once the NLE pushes it back", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await prisma.marker.update({ where: { id: w.marker1.id }, data: { nleId: "n1" } });
		await prisma.$transaction((tx) => deleteMarkersRecorded(tx, { id: w.marker1.id }));
		await push({ upserts: [upsert({ nleId: "n1" })] });
		expect(await prisma.deletedMarker.count()).toBe(0);
	});

	it("400 for frames that aren't whole numbers or NLE ids used twice", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await expectHttpError(push({ upserts: [upsert({ frame: -1 })] }), 400);
		await expectHttpError(push({ upserts: [upsert({ frame: 1.5 })] }), 400);
		await expectHttpError(
			push({ upserts: [upsert({ nleId: "n1" }), upsert({ nleId: "n1" })] }),
			400,
		);
		expect(await prisma.markerSet.count()).toBe(0);
	});

	it("404 when the path doesn't match the export, and nothing is backed up", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		await expectHttpError(push({}, w.exp1.id, w.tl2.id), 404);
		expect(await prisma.markerSet.count()).toBe(0);
	});

	it("reviewer gets the plugin role error", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectPluginRoleError(push({ upserts: [upsert()] }));
	});
});

// ─── linkMarkers (after a pull) ─────────────────────────────────────────────

describe("linkMarkers", () => {
	it("links markers to NLE markers and forgets the deleted ones removed from the NLE", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const gone = await f.createMarker(w.exp1, w.category);
		await prisma.$transaction((tx) => deleteMarkersRecorded(tx, { id: gone.id }));

		await markers.linkMarkers(w.projectA.id, w.tl1.id, w.exp1.id, {
			nleTimelineId: "nle-tl",
			links: [{ id: w.marker1.id, nleId: "n9", syncHash: "h9" }],
			forgetDeleted: [gone.id],
		});
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } })).toMatchObject({
			nleId: "n9",
			nleTimelineId: "nle-tl",
			syncHash: "h9",
		});
		expect(await prisma.deletedMarker.count()).toBe(0);
	});
});

// ─── origin ──────────────────────────────────────────────────────────────────

describe("getMarkerOrigin", () => {
	it("tells a browser upload from a plugin render, with the export's start", async () => {
		await prisma.export.update({
			where: { id: w.exp1.id },
			data: {
				timelineSnapshot: {
					startFrameIndex: 0,
					frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
					metadata: { source: "web-upload" },
				},
			},
		});
		await prisma.export.update({
			where: { id: w.exp2.id },
			data: { timelineSnapshot: { startFrameIndex: 90000, metadata: {} } },
		});
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		expect(await markers.getMarkerOrigin(w.projectA.id, w.tl1.id, w.exp1.id)).toEqual({
			startFrameIndex: 0,
			frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
			webUpload: true,
		});
		expect(await markers.getMarkerOrigin(w.projectA.id, w.tl2.id, w.exp2.id)).toEqual({
			startFrameIndex: 90000,
			frameRate: null,
			webUpload: false,
		});
	});
});

// ─── deleted markers ────────────────────────────────────────────────────────

describe("getDeletedMarkers", () => {
	it("lists the export's markers deleted in PostPin, with their NLE link", async () => {
		await prisma.marker.update({
			where: { id: w.marker1.id },
			data: { nleId: "n1", nleTimelineId: "nle-tl", syncHash: "h1" },
		});
		await prisma.$transaction((tx) => deleteMarkersRecorded(tx, { id: w.marker1.id }));
		await signInAs(w, MEMBER, { projectId: w.projectA.id });

		expect(await markers.getDeletedMarkers(w.projectA.id, w.tl1.id, w.exp1.id)).toEqual([
			expect.objectContaining({
				markerId: w.marker1.id,
				nleId: "n1",
				nleTimelineId: "nle-tl",
				syncHash: "h1",
			}),
		]);
		expect(await markers.getDeletedMarkers(w.projectA.id, w.tl2.id, w.exp2.id)).toEqual([]);
	});
});

// ─── marker sets ────────────────────────────────────────────────────────────

const createSet = (body: Partial<Parameters<MarkerSetController["createMarkerSet"]>[2]> = {}) =>
	sets.createMarkerSet(w.projectA.id, w.tl1.id, {
		action: "PULL",
		exportId: w.exp1.id,
		nleTimelineId: "nle-tl",
		hostName: "Resolve",
		nleMarkers: [],
		summary: { nle: { added: 1, updated: 0, removed: 0 } },
		...body,
	});

describe("marker sets", () => {
	it("lists a timeline's sets newest first, narrowed to one NLE timeline", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const first = await createSet();
		const second = await createSet({ action: "CLEAR", exportId: null });
		await createSet({ nleTimelineId: "another" });

		const list = await sets.getMarkerSets(w.projectA.id, w.tl1.id, "nle-tl");
		expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
		expect(list[1]).toMatchObject({ action: "PULL", exportName: w.exp1.name, hostName: "Resolve" });
		expect(list[1]).not.toHaveProperty("nleMarkers");
	});

	it("backs up the export's markers with responses and pointers", async () => {
		await prisma.response.create({ data: { markerId: w.marker1.id, content: "agree" } });
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const { id } = await createSet();
		const detail = await sets.getMarkerSet(w.projectA.id, w.tl1.id, id);
		expect(detail.postpinMarkers!.markers).toEqual([
			expect.objectContaining({
				id: w.marker1.id,
				categoryName: w.category.name,
				responses: [expect.objectContaining({ content: "agree" })],
			}),
		]);
	});

	it("delete all unlinks the timeline's markers from the NLE timeline", async () => {
		await prisma.marker.update({
			where: { id: w.marker1.id },
			data: { nleId: "n1", nleTimelineId: "nle-tl", syncHash: "h1" },
		});
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await createSet({ action: "CLEAR", exportId: null });
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } })).toMatchObject({
			nleId: null,
			nleTimelineId: null,
		});
	});

	it("404 for a set of another timeline, and for timelines outside the user's grants", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		const { id } = await createSet();
		await expectHttpError(sets.getMarkerSet(w.projectA.id, w.tl2.id, id), 404);

		await signInAs(w, MEMBER, { timelineId: w.tl2.id });
		await expectHttpError(sets.getMarkerSets(w.projectA.id, w.tl1.id), 404);
	});

	it("404 for an export of another timeline", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		await expectHttpError(createSet({ exportId: w.exp2.id }), 404);
	});

	it("reviewer gets the plugin role error", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectPluginRoleError(sets.getMarkerSets(w.projectA.id, w.tl1.id));
	});
});

describe("restoreMarkerSet", () => {
	const restore = (id: string) =>
		sets.restoreMarkerSet(w.projectA.id, w.tl1.id, id, {
			nleTimelineId: "nle-tl",
			hostName: "Resolve",
			nleMarkers: [],
		});

	it("undoes a push: reverts changes, removes added markers, brings back deleted ones", async () => {
		const response = await prisma.response.create({
			data: { markerId: w.marker1.id, content: "keep me", authorId: w.owner.user.id },
		});
		await prisma.marker.update({
			where: { id: w.marker1.id },
			data: { nleId: "n1", nleTimelineId: "nle-tl" },
		});
		const changed = await f.createMarker(w.exp1, w.category, { frame: 30 });
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });

		const { markerSetId } = await push({
			upserts: [
				upsert({ id: changed.id, name: "Changed", frame: 30 }),
				upsert({ nleId: "n5", name: "Added", frame: 200 }),
			],
			deleteIds: [w.marker1.id],
		});
		expect((await markersOf(w.exp1.id)).map((m) => m.name)).toEqual(["Changed", "Added"]);

		const result = await restore(markerSetId);
		expect(result.summary).toEqual({ postpin: { added: 1, updated: 1, removed: 1 } });

		const after = await markersOf(w.exp1.id);
		expect(after.map((m) => [m.id, m.name])).toEqual([
			[w.marker1.id, w.marker1.name],
			[changed.id, changed.name],
		]);
		expect(after[0]).toMatchObject({ nleId: "n1", authorId: w.owner.user.id });
		expect(await prisma.response.findUniqueOrThrow({ where: { id: response.id } })).toMatchObject({
			content: "keep me",
			markerId: w.marker1.id,
		});
		// the removed marker is remembered as deleted, so a pull takes it out of the NLE
		expect(await prisma.deletedMarker.findMany({ select: { nleId: true } })).toEqual([
			{ nleId: "n5" },
		]);
		// and the restore itself can be undone
		const backup = await prisma.markerSet.findUniqueOrThrow({ where: { id: result.markerSetId } });
		expect(backup.action).toBe("RESTORE");
		const beforeRestore = backup.postpinMarkers as unknown as PostPinMarkerSnapshot;
		expect(beforeRestore.markers.map((m) => m.name)).toEqual(["Changed", "Added"]);
	});

	it("recreates a category deleted since", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const temp = await f.createCategory(w.projectA);
		await prisma.marker.update({ where: { id: w.marker1.id }, data: { categoryId: temp.id } });
		const { id } = await createSet();
		await prisma.$transaction((tx) => deleteMarkersRecorded(tx, { id: w.marker1.id }));
		await prisma.category.delete({ where: { id: temp.id } });

		await restore(id);
		const restored = await prisma.marker.findUniqueOrThrow({
			where: { id: w.marker1.id },
			include: { category: true },
		});
		expect(restored.category).toMatchObject({ name: temp.name, color: temp.color });
	});

	it("409 for a set without export", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const { id } = await createSet({ action: "CLEAR", exportId: null });
		await expectHttpError(restore(id), 409);
	});
});

// ─── deletions in the web app are remembered ────────────────────────────────

describe("deleteMarkersRecorded", () => {
	it("deletes the markers and keeps their NLE link and sync state", async () => {
		await prisma.marker.update({
			where: { id: w.marker1.id },
			data: { nleId: "n1", nleTimelineId: "nle-tl", syncHash: "h1" },
		});
		const removed = await prisma.$transaction((tx) =>
			deleteMarkersRecorded(tx, { exportId: w.exp1.id }),
		);
		expect(removed.map((m) => m.id)).toEqual([w.marker1.id]);
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(0);
		expect(await prisma.deletedMarker.findMany()).toEqual([
			expect.objectContaining({
				markerId: w.marker1.id,
				exportId: w.exp1.id,
				nleId: "n1",
				nleTimelineId: "nle-tl",
				syncHash: "h1",
			}),
		]);
	});
});
