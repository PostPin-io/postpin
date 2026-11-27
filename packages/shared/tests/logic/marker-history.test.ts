import { describe, expect, it } from "vitest";
import {
	changedState,
	conflictingMarkers,
	exportsOf,
	stepLabel,
	type MarkerState,
	type MarkerStateEntry,
} from "../../src/logic/marker-history.ts";

const marker = (id: string, over: Partial<MarkerStateEntry> = {}): MarkerStateEntry => ({
	id,
	exportId: "exp",
	name: "Cut",
	description: null,
	frame: 10,
	duration: 0,
	categoryId: "cat",
	categoryName: "General",
	categoryColor: "#fff",
	nleId: null,
	nleTimelineId: null,
	syncHash: null,
	authorId: "u",
	guestId: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	responses: [],
	pointers: [],
	...over,
});
const state = (...markers: MarkerStateEntry[]): MarkerState => ({ format: 1, markers });

describe("conflictingMarkers", () => {
	it("none while everything is as the step left it", () => {
		const after = state(marker("a", { frame: 20 }));
		expect(conflictingMarkers(["a"], after, after, state(marker("a")))).toEqual([]);
	});

	it("a marker changed, deleted or added since", () => {
		const expected = state(marker("a"), marker("b"));
		const current = state(marker("a", { name: "Other" }), marker("c"));
		expect(conflictingMarkers(["a", "b", "c"], current, expected, expected)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("null and empty descriptions are the same", () => {
		const a = state(marker("a", { description: "" }));
		expect(conflictingMarkers(["a"], a, state(marker("a")), a)).toEqual([]);
	});

	it("a new response only counts when going back would delete the marker", () => {
		const reply = { id: "r", content: "ok", authorId: "u", createdAt: "", updatedAt: "" };
		const current = state(marker("a", { responses: [reply] }));
		const expected = state(marker("a"));
		expect(conflictingMarkers(["a"], current, expected, expected)).toEqual([]);
		expect(conflictingMarkers(["a"], current, expected, state())).toEqual(["a"]);
	});
});

describe("changedState", () => {
	it("is false for an edit to the same values", () => {
		expect(changedState(["a"], state(marker("a")), state(marker("a")))).toBe(false);
		expect(changedState(["a"], state(marker("a")), state(marker("a", { frame: 1 })))).toBe(true);
		expect(changedState(["a"], state(), state(marker("a")))).toBe(true);
	});
});

describe("helpers", () => {
	it("exportsOf lists each export once", () => {
		expect(exportsOf(state(marker("a")), state(marker("a", { exportId: "other" })))).toEqual([
			"exp",
			"other",
		]);
	});

	it("stepLabel counts the markers", () => {
		expect(stepLabel("DELETE", 1)).toBe("Delete marker");
		expect(stepLabel("PASTE", 3)).toBe("Paste 3 markers");
	});
});
