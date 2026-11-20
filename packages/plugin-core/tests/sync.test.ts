import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOLVE_CAPABILITIES, fakeNle } from "./fakes.ts";
import type { NleMarker } from "../src/bridge.ts";

const api = vi.hoisted(() => ({
	getMarkers: vi.fn(),
	getDeletedMarkers: vi.fn(),
	getMarkerOrigin: vi.fn(),
	getCategories: vi.fn(),
	createCategory: vi.fn(),
	syncMarkers: vi.fn(),
	linkMarkers: vi.fn(),
	createMarkerSet: vi.fn(),
}));
vi.mock("@postpin-io/api-client-ts", () => api);

import {
	applyPull,
	applyPush,
	clearMarkers,
	frameOffset,
	planPull,
	planPush,
	previewPull,
	previewPush,
	selectionFor,
	type SyncMode,
	type SyncPreview,
} from "../src/sync.ts";
import { syncHash } from "../src/syncHash.ts";
import type { Client } from "@postpin-io/api-client-ts/client";

type Category = { id: string; name: string; color: string };
type ServerMarker = {
	id: string;
	nleId: string | null;
	nleTimelineId: string | null;
	syncHash: string | null;
	name: string;
	description: string | null;
	frame: number;
	duration: number;
	categoryId: string;
};
type Deleted = {
	markerId: string;
	exportId: string;
	nleId: string | null;
	nleTimelineId: string | null;
	syncHash: string | null;
};

const client = {} as Client;
const ids = { projectId: "p1", timelineId: "t1", exportId: "e1" };
// fakeNle's timeline
const NLE_TIMELINE = "nle-timeline";

let categories: Category[];
let serverMarkers: ServerMarker[];
let deleted: Deleted[];

const nleMarker = (overrides: Partial<NleMarker>): NleMarker => ({
	nleId: "n1",
	title: "Marker",
	description: "",
	frame: 100,
	duration: 0,
	color: "Blue",
	customData: null,
	...overrides,
});

const serverMarker = (overrides: Partial<ServerMarker>): ServerMarker => ({
	id: "m1",
	nleId: null,
	nleTimelineId: null,
	syncHash: null,
	name: "Marker",
	description: null,
	frame: 100,
	duration: 0,
	categoryId: "c-blue",
	...overrides,
});

/** A server marker synced with the NLE marker n1 in its current state */
const synced = (overrides: Partial<ServerMarker> = {}) => {
	const marker = serverMarker({ nleId: "n1", nleTimelineId: NLE_TIMELINE, ...overrides });
	return { ...marker, syncHash: hashOf(marker), ...overrides };
};

function hashOf(m: ServerMarker) {
	return syncHash({
		name: m.name,
		description: m.description,
		frame: m.frame,
		duration: m.duration,
		categoryName: categories.find((c) => c.id === m.categoryId)!.name,
	});
}

const pushBody = () => api.syncMarkers.mock.calls[0]![0].body;
const linkBody = () => api.linkMarkers.mock.calls[0]![0].body;

beforeEach(() => {
	categories = [
		{ id: "c-vfx", name: "VFX", color: "#FF0000" },
		{ id: "c-blue", name: "Resolve Blue", color: "#0000FF" },
	];
	serverMarkers = [];
	deleted = [];
	let nextCategory = 1;
	for (const fn of Object.values(api)) fn.mockReset();
	// a fresh copy each call, like a real response
	api.getCategories.mockImplementation(async () => ({ data: categories.map((c) => ({ ...c })) }));
	api.createCategory.mockImplementation(async ({ body }) => {
		const category = { id: `c-new-${nextCategory++}`, ...body };
		categories.push(category);
		return { data: category };
	});
	api.getMarkers.mockImplementation(async () => ({ data: serverMarkers }));
	api.getDeletedMarkers.mockImplementation(async () => ({ data: deleted }));
	api.getMarkerOrigin.mockResolvedValue({ data: { startFrameIndex: 0, webUpload: false } });
	api.syncMarkers.mockImplementation(async ({ body }) => ({
		data: {
			markerSetId: "set-push",
			markers: body.upserts.map((_: unknown, i: number) => ({ id: `x${i}`, nleId: null })),
		},
	}));
	api.linkMarkers.mockResolvedValue({ data: undefined });
	api.createMarkerSet.mockResolvedValue({ data: { id: "set-1" } });
});

/** The preview's keys for the mode, with the deletions too when asked (an old shortcut) */
function pick(preview: SyncPreview, mode: SyncMode, withDeletions = false) {
	const selected = selectionFor(preview, mode);
	if (withDeletions) for (const row of preview.removals) selected.add(row.key);
	return selected;
}

async function push(nle: ReturnType<typeof fakeNle>, deleteInPostPin = false) {
	const context = { nle, client, ...ids };
	const plan = await planPush(context);
	const selected = pick(previewPush(plan), "add", deleteInPostPin);
	return { plan, report: await applyPush(context, plan, { selected }) };
}

async function pull(nle: ReturnType<typeof fakeNle>, removeFromNle = false) {
	const context = { nle, client, ...ids };
	const plan = await planPull(context);
	const selected = pick(previewPull(plan), "add", removeFromNle);
	return { plan, report: await applyPull(context, plan, { selected }) };
}

describe("push", () => {
	it("creates new markers in their tag's category, with the NLE timeline and a backup", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", description: "#VFX\n\nFix the sky" }),
		]);
		const { report } = await push(nle);

		const body = pushBody();
		expect(body.nleTimelineId).toBe(NLE_TIMELINE);
		expect(body.hostName).toBe("Resolve");
		expect(body.nleMarkers).toHaveLength(1);
		expect(body.upserts).toEqual([
			expect.objectContaining({
				nleId: "n1",
				name: "Marker",
				description: "Fix the sky",
				categoryId: "c-vfx",
				syncHash: expect.any(String),
			}),
		]);
		expect(body.upserts[0]).not.toHaveProperty("id");
		expect(body.summary).toEqual({ postpin: { added: 1, updated: 0, removed: 0 } });
		expect(report.markerSetId).toBe("set-push");
	});

	it("matches tags to categories without case and creates a missing category once", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", description: "#vfx\nsky" }),
			nleMarker({ nleId: "n2", description: "#Sound\n\nhum" }),
			nleMarker({ nleId: "n3", description: "#sound\n\nbuzz" }),
		]);
		await push(nle);
		expect(api.createCategory).toHaveBeenCalledTimes(1);
		expect(pushBody().upserts.map((u: { categoryId: string }) => u.categoryId)).toEqual([
			"c-vfx",
			"c-new-1",
			"c-new-1",
		]);
	});

	it("keeps a '#' first line as description when it's no tag", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ description: "#2 check again\nnow" })]);
		await push(nle);
		expect(pushBody().upserts[0]).toMatchObject({
			description: "#2 check again\nnow",
			categoryId: "c-blue",
		});
	});

	it("does nothing for markers unchanged since the last sync", async () => {
		serverMarkers = [synced()];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		const { report } = await push(nle);
		expect(api.syncMarkers).not.toHaveBeenCalled();
		expect(report.message).toBe("Nothing to push.");
	});

	it("updates markers changed in the NLE", async () => {
		serverMarkers = [synced()];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ title: "Renamed" })]);
		const { report } = await push(nle);
		expect(pushBody().upserts).toEqual([expect.objectContaining({ id: "m1", name: "Renamed" })]);
		expect(report.warnings).toEqual([]);
	});

	it("keeps PostPin's version of markers changed only in PostPin", async () => {
		const base = synced();
		serverMarkers = [{ ...base, name: "Changed in the browser" }];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		const { plan, report } = await push(nle);
		expect(plan.keptInPostPin).toHaveLength(1);
		expect(api.syncMarkers).not.toHaveBeenCalled();
		expect(report.warnings[0]).toMatch(/kept PostPin's version/);
	});

	it("lets the NLE win when both sides changed a marker, with a warning", async () => {
		const base = synced();
		serverMarkers = [{ ...base, name: "Browser" }];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ title: "Resolve" })]);
		const { report } = await push(nle);
		expect(pushBody().upserts[0]).toMatchObject({ id: "m1", name: "Resolve" });
		expect(report.warnings[0]).toMatch(/Resolve's version won/);
	});

	it("pairs by the PostPin id in the custom data before the NLE id", async () => {
		serverMarkers = [
			serverMarker({ id: "m1", nleId: "n1" }),
			serverMarker({ id: "m2", nleId: null }),
		];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", customData: '{"__postpin":1,"id":"m2"}', title: "New" }),
		]);
		await push(nle);
		expect(pushBody().upserts[0]).toMatchObject({ id: "m2", nleId: "n1" });
	});

	it("asks before deleting markers gone from the NLE, and deletes them only with a yes", async () => {
		serverMarkers = [synced({ id: "gone", nleId: "n-gone" })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, []);

		const kept = await push(nle, false);
		expect(kept.plan.deletedInNle.map((m) => m.id)).toEqual(["gone"]);
		expect(api.syncMarkers).not.toHaveBeenCalled();
		expect(kept.report.warnings[0]).toMatch(/stays in PostPin/);

		const removed = await push(nle, true);
		expect(pushBody().deleteIds).toEqual(["gone"]);
		expect(removed.report.message).toMatch(/1 deleted/);
	});

	it("never offers to delete markers synced with another NLE timeline or never synced", async () => {
		serverMarkers = [
			synced({ id: "other", nleId: "x", nleTimelineId: "other-timeline" }),
			serverMarker({ id: "web" }),
		];
		const { plan } = await push(fakeNle(RESOLVE_CAPABILITIES, []));
		expect(plan.deletedInNle).toEqual([]);
	});

	it("doesn't push back markers deleted in PostPin unless the NLE changed them since", async () => {
		const base = synced();
		deleted = [
			{
				markerId: "m1",
				exportId: "e1",
				nleId: "n1",
				nleTimelineId: NLE_TIMELINE,
				syncHash: base.syncHash,
			},
		];
		const unchanged = await push(fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]));
		expect(unchanged.plan.deletedInPostPin).toHaveLength(1);
		expect(api.syncMarkers).not.toHaveBeenCalled();

		await push(fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ title: "Edited" })]));
		expect(pushBody().upserts).toEqual([expect.objectContaining({ name: "Edited" })]);
	});

	it("leaves the duration out when the adapter doesn't know it", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ duration: undefined })]);
		await push(nle);
		expect(pushBody().upserts[0]).not.toHaveProperty("duration");
	});

	it("refreshes the link of a marker whose NLE id changed", async () => {
		serverMarkers = [synced({ nleId: "old" })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", customData: '{"__postpin":1,"id":"m1"}' }),
		]);
		const { report } = await push(nle);
		expect(pushBody().upserts).toEqual([expect.objectContaining({ id: "m1", nleId: "n1" })]);
		expect(report.message).toBe("Nothing to push.");
	});
});

describe("pull", () => {
	it("backs up, writes new markers with tag, color and PostPin id, and links them", async () => {
		serverMarkers = [
			serverMarker({ id: "m1", categoryId: "c-vfx", description: "Fix the sky", frame: 50 }),
		];
		const nle = fakeNle();
		const { report } = await pull(nle);

		expect(api.createMarkerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					action: "PULL",
					exportId: "e1",
					summary: { nle: { added: 1, updated: 0, removed: 0 } },
				}),
			}),
		);
		expect(nle.state.markers).toEqual([
			expect.objectContaining({
				description: "#VFX\n\nFix the sky",
				color: "Red",
				frame: 50,
				customData: '{"__postpin":1,"id":"m1"}',
			}),
		]);
		expect(linkBody()).toEqual({
			nleTimelineId: NLE_TIMELINE,
			links: [{ id: "m1", nleId: "nle-1", syncHash: hashOf(serverMarkers[0]!) }],
			forgetDeleted: [],
		});
		expect(report.message).toBe("Synced to Resolve: 1 new.");
	});

	it("writes no tag for categories named after their host color", async () => {
		serverMarkers = [serverMarker({ categoryId: "c-blue", description: "text" })];
		const nle = fakeNle();
		await pull(nle);
		expect(nle.state.markers[0]).toMatchObject({ description: "text", color: "Blue" });
	});

	it("links the markers that were written when others fail, and reports the failures", async () => {
		serverMarkers = [
			serverMarker({ id: "ok", name: "Ok" }),
			serverMarker({ id: "bad", name: "Bad" }),
		];
		const nle = fakeNle();
		nle.setMarkers.mockResolvedValueOnce([
			{ nleId: "n-ok" },
			{ nleId: null, error: "frame taken" },
		]);
		const { report } = await pull(nle);
		expect(linkBody().links).toEqual([{ id: "ok", nleId: "n-ok", syncHash: expect.any(String) }]);
		expect(report.warnings).toEqual([
			"1 marker couldn't be written to Resolve:",
			'"Bad": frame taken',
		]);
		expect(report.message).toBe("Synced to Resolve: 1 new.");
	});

	it("updates markers changed in PostPin and keeps the ones changed only in the NLE", async () => {
		const a = synced({ id: "a", nleId: "na" });
		const b = synced({ id: "b", nleId: "nb" });
		serverMarkers = [{ ...a, name: "Changed in PostPin" }, b];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "na" }),
			nleMarker({ nleId: "nb", title: "Changed in Resolve" }),
		]);
		const { plan } = await pull(nle);
		expect(plan.update.map((u) => u.server.id)).toEqual(["a"]);
		expect(plan.keptInNle.map((k) => k.server.id)).toEqual(["b"]);
		expect(nle.state.markers.map((m) => m.title)).toEqual([
			"Changed in PostPin",
			"Changed in Resolve",
		]);
	});

	it("doesn't add markers deleted in the NLE again, unless PostPin changed them since", async () => {
		const base = synced();
		serverMarkers = [base];
		const unchanged = await pull(fakeNle());
		expect(unchanged.plan.deletedInNle).toHaveLength(1);
		expect(unchanged.plan.add).toEqual([]);

		serverMarkers = [{ ...base, name: "Answered in the browser" }];
		const changed = await pull(fakeNle());
		expect(changed.plan.add).toHaveLength(1);
	});

	it("asks before removing markers deleted in PostPin, and forgets them once removed", async () => {
		deleted = [
			{ markerId: "m1", exportId: "e1", nleId: "n1", nleTimelineId: NLE_TIMELINE, syncHash: null },
		];
		const kept = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		const first = await pull(kept, false);
		expect(first.plan.deletedInPostPin).toHaveLength(1);
		expect(kept.removeMarkers).not.toHaveBeenCalled();

		const removed = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		await pull(removed, true);
		expect(removed.removeMarkers).toHaveBeenCalledWith(["n1"]);
		expect(removed.state.markers).toEqual([]);
		expect(api.linkMarkers.mock.calls.at(-1)![0].body.forgetDeleted).toEqual(["m1"]);
	});

	it("does nothing without changes", async () => {
		serverMarkers = [synced()];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		const { report } = await pull(nle);
		expect(api.createMarkerSet).not.toHaveBeenCalled();
		expect(nle.setMarkers).not.toHaveBeenCalled();
		expect(report.message).toBe("Nothing to sync.");
	});
});

describe("frame offset", () => {
	it("shifts only exports uploaded in the browser, by the difference of the starts", () => {
		expect(frameOffset({ startFrame: 90000 }, { startFrameIndex: 0, webUpload: true })).toBe(90000);
		// a plugin render (e.g. a Pro Tools selection) shares the timeline's frames
		expect(frameOffset({ startFrame: 90000 }, { startFrameIndex: 91000, webUpload: false })).toBe(
			0,
		);
		expect(frameOffset({}, { startFrameIndex: 0, webUpload: true })).toBe(0);
		expect(frameOffset({ startFrame: 90000 }, { startFrameIndex: null, webUpload: true })).toBe(0);
	});

	it("pulls a browser upload's markers onto the timeline's frames and pushes them back", async () => {
		api.getMarkerOrigin.mockResolvedValue({ data: { startFrameIndex: 0, webUpload: true } });
		serverMarkers = [serverMarker({ id: "m1", frame: 138 })];
		const nle = fakeNle();
		nle.getTimelineInfo.mockResolvedValue({
			name: "Cut 3",
			id: NLE_TIMELINE,
			projectId: "nle-project",
			projectName: "Feature",
			startFrame: 90000,
		} as never);
		await pull(nle);
		expect(nle.state.markers[0]).toMatchObject({ frame: 90138 });

		// the NLE's copy is unchanged in PostPin's frames, a moved one goes back without the offset
		serverMarkers = [{ ...serverMarkers[0]!, nleId: "nle-1", nleTimelineId: NLE_TIMELINE }];
		serverMarkers[0]!.syncHash = hashOf(serverMarkers[0]!);
		expect((await push(nle)).report.message).toBe("Nothing to push.");
		nle.state.markers[0]!.frame = 90200;
		await push(nle);
		expect(pushBody().upserts[0]).toMatchObject({ id: "m1", frame: 200 });
	});
});

describe("previews", () => {
	it("lists what a push adds, changes and would delete in PostPin", async () => {
		serverMarkers = [synced({ id: "m1", nleId: "n1" }), synced({ id: "gone", nleId: "n-gone" })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", title: "Renamed", frame: 120 }),
			nleMarker({ nleId: "n2", title: "New", description: "#VFX\n\nsky" }),
		]);
		const preview = previewPush(await planPush({ nle, client, ...ids }));
		expect(preview.target).toBe("postpin");
		expect(preview.rows).toEqual([
			{ key: "new:0", kind: "add", name: "New", frame: 100, categoryName: "VFX", changes: [] },
			{
				key: "changed:0",
				kind: "update",
				name: "Renamed",
				frame: 120,
				categoryName: "Resolve Blue",
				changes: ['Name: "Marker" → "Renamed"', "Moved"],
			},
		]);
		expect(preview.removals.map((r) => [r.kind, r.name])).toEqual([["remove", "Marker"]]);
	});

	it("shows a pull's frames on the NLE timeline", async () => {
		api.getMarkerOrigin.mockResolvedValue({
			data: { startFrameIndex: 0, webUpload: true, frameRate: null },
		});
		deleted = [{ markerId: "x", exportId: "e1", nleId: "n9", nleTimelineId: null, syncHash: null }];
		serverMarkers = [serverMarker({ id: "m1", frame: 138 })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ nleId: "n9", frame: 90050 })]);
		nle.getTimelineInfo.mockResolvedValue({
			name: "Cut 3",
			id: NLE_TIMELINE,
			projectId: "nle-project",
			projectName: "Feature",
			startFrame: 90000,
		} as never);
		const preview = previewPull(await planPull({ nle, client, ...ids }));
		expect(preview.target).toBe("nle");
		expect(preview.rows.map((r) => [r.kind, r.frame])).toEqual([["add", 90138]]);
		expect(preview.removals.map((r) => [r.kind, r.frame])).toEqual([["remove", 90050]]);
		expect(preview.notes.at(-1)).toMatch(/shifted/);
	});
});

describe("modes and single markers", () => {
	it("add & update leaves deletions out, match takes all, single keys pick markers", async () => {
		serverMarkers = [synced({ id: "gone", nleId: "n-gone" })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "a", title: "A" }),
			nleMarker({ nleId: "b", title: "B" }),
		]);
		const plan = await planPush({ nle, client, ...ids });
		const preview = previewPush(plan);
		expect([...selectionFor(preview, "add")]).toEqual(["new:0", "new:1"]);
		expect([...selectionFor(preview, "match")]).toEqual(["new:0", "new:1", "gone:0"]);

		await applyPush({ nle, client, ...ids }, plan, { selected: new Set(["new:1"]) });
		expect(pushBody().upserts.map((u: { name: string }) => u.name)).toEqual(["B"]);
		expect(pushBody().deleteIds).toEqual([]);
	});
});

describe("deselected changes", () => {
	it("a push without write only deletes what the user agreed to", async () => {
		serverMarkers = [synced({ id: "gone", nleId: "n-gone" })];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ nleId: "n2", title: "New" })]);
		const context = { nle, client, ...ids };
		const plan = await planPush(context);
		const keys = new Set(previewPush(plan).removals.map((r) => r.key));
		await applyPush(context, plan, { selected: keys });
		expect(pushBody().upserts).toEqual([]);
		expect(pushBody().deleteIds).toEqual(["gone"]);
		expect(pushBody().summary).toEqual({ postpin: { added: 0, updated: 0, removed: 1 } });
	});

	it("a pull without write leaves the NLE alone", async () => {
		serverMarkers = [serverMarker({ id: "m1" })];
		const nle = fakeNle();
		const context = { nle, client, ...ids };
		const report = await applyPull(context, await planPull(context), { selected: new Set() });
		expect(nle.setMarkers).not.toHaveBeenCalled();
		expect(api.createMarkerSet).not.toHaveBeenCalled();
		expect(report.message).toBe("Nothing to sync.");
	});
});

describe("bringing back deleted markers", () => {
	it("a pull shows markers deleted in the NLE and adds them only when asked", async () => {
		serverMarkers = [synced()];
		const nle = fakeNle();
		const context = { nle, client, ...ids };
		const plan = await planPull(context);
		expect(previewPull(plan).restores.map((r) => [r.kind, r.name])).toEqual([
			["restore", "Marker"],
		]);

		const preview = previewPull(plan);
		const kept = await applyPull(context, plan, {
			selected: selectionFor(preview, "add"),
			previewed: true,
		});
		expect(nle.state.markers).toEqual([]);
		expect(kept.warnings).toEqual([]);

		await applyPull(context, plan, { selected: selectionFor(preview, "match"), previewed: true });
		expect(nle.state.markers).toEqual([expect.objectContaining({ title: "Marker" })]);
		expect(linkBody().links).toEqual([expect.objectContaining({ id: "m1", nleId: "nle-1" })]);
	});

	it("a push shows markers deleted in PostPin and creates them again only when asked", async () => {
		const base = synced();
		deleted = [
			{
				markerId: "m1",
				exportId: "e1",
				nleId: "n1",
				nleTimelineId: NLE_TIMELINE,
				syncHash: base.syncHash,
			},
		];
		const context = { nle: fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]), client, ...ids };
		const plan = await planPush(context);
		expect(previewPush(plan).restores).toHaveLength(1);

		await applyPush(context, plan, { selected: selectionFor(previewPush(plan), "match") });
		expect(pushBody().upserts).toEqual([expect.objectContaining({ nleId: "n1", name: "Marker" })]);
		expect(pushBody().upserts[0]).not.toHaveProperty("id");
	});
});

describe("pull reports", () => {
	it("says nothing was written when every marker failed, once per reason", async () => {
		serverMarkers = [serverMarker({ id: "a", name: "A" }), serverMarker({ id: "b", name: "B" })];
		const nle = fakeNle();
		nle.setMarkers.mockResolvedValueOnce([
			{ nleId: null, error: "before the timeline" },
			{ nleId: null, error: "before the timeline" },
		]);
		const { report } = await pull(nle);
		expect(report.message).toBe("Nothing could be written to Resolve.");
		expect(report.warnings).toEqual([
			"2 markers couldn't be written to Resolve:",
			'"A", "B": before the timeline',
		]);
		expect(api.linkMarkers).not.toHaveBeenCalled();
	});
});

describe("clearMarkers", () => {
	it("backs up the NLE's markers before deleting them", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({}), nleMarker({ nleId: "n2" })]);
		const report = await clearMarkers({
			nle,
			client,
			projectId: "p1",
			timelineId: "t1",
			exportId: null,
		});
		expect(api.createMarkerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					action: "CLEAR",
					nleMarkers: expect.arrayContaining([expect.objectContaining({ nleId: "n2" })]),
					summary: { nle: { added: 0, updated: 0, removed: 2 } },
				}),
			}),
		);
		expect(nle.clearMarkers).toHaveBeenCalled();
		expect(report.markerSetId).toBe("set-1");
	});

	it("doesn't delete when the backup fails", async () => {
		api.createMarkerSet.mockRejectedValueOnce(new Error("offline"));
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]);
		await expect(
			clearMarkers({ nle, client, projectId: "p1", timelineId: "t1", exportId: null }),
		).rejects.toThrow("offline");
		expect(nle.clearMarkers).not.toHaveBeenCalled();
	});

	it("takes no backup without markers", async () => {
		const nle = fakeNle();
		await clearMarkers({ nle, client, projectId: "p1", timelineId: "t1", exportId: null });
		expect(api.createMarkerSet).not.toHaveBeenCalled();
	});
});
