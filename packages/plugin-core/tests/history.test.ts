import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOLVE_CAPABILITIES, fakeNle } from "./fakes.ts";
import type { NleMarker } from "../src/bridge.ts";

const api = vi.hoisted(() => ({
	getMarkers: vi.fn(),
	getMarkerSet: vi.fn(),
	getMarkerSets: vi.fn(),
	createMarkerSet: vi.fn(),
	linkMarkers: vi.fn(),
	restoreMarkerSet: vi.fn(),
}));
vi.mock("@postpin-io/api-client-ts", () => api);

import { planNleRestore, restoreFromHistory, restoredSides } from "../src/history.ts";
import type { Client } from "@postpin-io/api-client-ts/client";

const client = {} as Client;
const context = { client, projectId: "p1", timelineId: "t1" };

const marker = (overrides: Partial<NleMarker>): NleMarker => ({
	nleId: "n1",
	title: "Marker",
	description: "",
	frame: 100,
	duration: 0,
	color: "Blue",
	customData: null,
	...overrides,
});

const set = (overrides: Record<string, unknown>) => ({
	id: "s1",
	action: "CLEAR",
	timelineId: "t1",
	exportId: "e1",
	exportName: "Cut 3 v1",
	nleTimelineId: "nle-timeline",
	nleTimelineName: "Cut 3",
	hostName: "Resolve",
	createdAt: "2026-11-20T10:00:00.000Z",
	createdBy: null,
	summary: { nle: { added: 0, updated: 0, removed: 2 } },
	nleMarkers: { format: 1, markers: [] },
	postpinMarkers: { format: 1, markers: [] },
	...overrides,
});

beforeEach(() => {
	for (const fn of Object.values(api)) fn.mockReset();
	api.getMarkers.mockResolvedValue({ data: [] });
	api.createMarkerSet.mockResolvedValue({ data: { id: "backup" } });
	api.linkMarkers.mockResolvedValue({ data: undefined });
});

describe("restoredSides", () => {
	it("restores the sides the action changed", () => {
		expect(restoredSides({ summary: { postpin: { added: 1, updated: 0, removed: 0 } } })).toEqual({
			nle: false,
			postpin: true,
		});
		expect(restoredSides({ summary: { nle: { added: 0, updated: 0, removed: 0 } } })).toEqual({
			nle: false,
			postpin: false,
		});
	});
});

describe("planNleRestore", () => {
	it("removes markers added since, writes changed and missing ones, skips unchanged ones", () => {
		const backup = [
			marker({ nleId: "same" }),
			marker({ nleId: "changed", title: "Old" }),
			marker({ nleId: "gone" }),
		];
		const current = [
			marker({ nleId: "same" }),
			marker({ nleId: "changed", title: "New" }),
			marker({ nleId: "added" }),
		];
		const plan = planNleRestore(backup, current);
		expect(plan.remove).toEqual(["added"]);
		expect(plan.write.map((w) => [w.marker.nleId, w.isNew])).toEqual([
			["changed", false],
			["gone", true],
		]);
	});
});

describe("restoreFromHistory", () => {
	it("undoes a delete all: backs up, puts the markers back and links them to PostPin again", async () => {
		api.getMarkerSet.mockResolvedValue({
			data: set({
				nleMarkers: { format: 1, markers: [marker({ nleId: "n1" }), marker({ nleId: "n2" })] },
				postpinMarkers: { format: 1, markers: [{ id: "m1", nleId: "n1" }] },
			}),
		});
		api.getMarkers.mockResolvedValue({ data: [{ id: "m1", nleId: null, syncHash: "h1" }] });
		const nle = fakeNle(RESOLVE_CAPABILITIES, []);

		const report = await restoreFromHistory({ ...context, nle }, "s1");

		expect(api.createMarkerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					action: "RESTORE",
					exportId: "e1",
					summary: { nle: { added: 2, updated: 0, removed: 0 } },
				}),
			}),
		);
		expect(nle.state.markers).toHaveLength(2);
		// the fake gives new ids, like Pro Tools numbers
		expect(api.linkMarkers.mock.calls[0]![0].body.links).toEqual([
			{ id: "m1", nleId: "nle-1", syncHash: "h1" },
		]);
		expect(api.restoreMarkerSet).not.toHaveBeenCalled();
		expect(report.message).toBe("Restored: Resolve 2 back.");
	});

	it("undoes a push on the server, with the NLE's markers as backup", async () => {
		api.getMarkerSet.mockResolvedValue({
			data: set({ action: "PUSH", summary: { postpin: { added: 3, updated: 0, removed: 0 } } }),
		});
		api.restoreMarkerSet.mockResolvedValue({
			data: { markerSetId: "backup", summary: { postpin: { added: 0, updated: 0, removed: 3 } } },
		});
		const nle = fakeNle(RESOLVE_CAPABILITIES, [marker({})]);

		const report = await restoreFromHistory({ ...context, nle }, "s1");

		expect(api.restoreMarkerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				path: { projectId: "p1", timelineId: "t1", markerSetId: "s1" },
				body: expect.objectContaining({ nleTimelineId: "nle-timeline", hostName: "Resolve" }),
			}),
		);
		expect(nle.setMarkers).not.toHaveBeenCalled();
		expect(report.message).toBe("Restored: PostPin 3 removed.");
	});

	it("refuses to restore the NLE side into another timeline", async () => {
		api.getMarkerSet.mockResolvedValue({ data: set({ nleTimelineId: "other" }) });
		await expect(restoreFromHistory({ ...context, nle: fakeNle() }, "s1")).rejects.toThrow(
			/belongs to the timeline/,
		);
	});
});
