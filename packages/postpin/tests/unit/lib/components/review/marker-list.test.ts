import { describe, expect, it } from "vitest";
import {
	filterMarkers,
	searchMarkers,
	selectRange,
	sortMarkers,
} from "#lib/components/review/markerList.ts";

const m = (
	id: string,
	o: Partial<{
		frame: number;
		createdAt: string;
		updatedAt: string;
		author: { name: string } | null;
	}> = {},
) => ({
	id,
	frame: 0,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
	author: null,
	...o,
});

describe("sortMarkers", () => {
	const list = [
		m("a", {
			frame: 30,
			createdAt: "2026-01-02",
			updatedAt: "2026-01-05",
			author: { name: "Zoe" },
		}),
		m("b", {
			frame: 10,
			createdAt: "2026-01-03",
			updatedAt: "2026-01-04",
			author: { name: "Ann" },
		}),
		m("c", { frame: 20, createdAt: "2026-01-01", updatedAt: "2026-01-06", author: null }),
	];
	const ids = (l: { id: string }[]) => l.map((x) => x.id);

	it.each([
		["timecode", "asc", ["b", "c", "a"]],
		["timecode", "desc", ["a", "c", "b"]],
		["createdAt", "asc", ["c", "a", "b"]],
		["updatedAt", "desc", ["c", "a", "b"]],
		["user", "asc", ["c", "b", "a"]],
	] as const)("%s %s", (field, dir, expected) => {
		expect(ids(sortMarkers(list, field, dir))).toEqual(expected);
	});

	it("accepts Date objects as well as strings", () => {
		const dated = [m("x", { frame: 0 }), { ...m("y"), updatedAt: new Date("2027-01-01") }];
		expect(ids(sortMarkers(dated as never[], "updatedAt", "desc"))).toEqual(["y", "x"]);
	});

	it("does not mutate the input", () => {
		const copy = [...list];
		sortMarkers(list, "timecode", "asc");
		expect(list).toEqual(copy);
	});
});

describe("searchMarkers", () => {
	const markers = [
		{ id: "1", name: "Color too warm", description: null, responses: [] },
		{ id: "2", name: "Cut", description: "Shorten the INTRO", responses: [] },
		{ id: "3", name: "Audio", description: "", responses: [{ content: "Fixed in v2" }] },
	];
	const ids = (q: string) => searchMarkers(markers, q).map((x) => x.id);

	it("finds in name, description and responses, ignoring case and outer spaces", () => {
		expect(ids("warm")).toEqual(["1"]);
		expect(ids("  intro ")).toEqual(["2"]);
		expect(ids("V2")).toEqual(["3"]);
	});

	it("an empty query matches everything", () => {
		expect(ids("")).toEqual(["1", "2", "3"]);
		expect(ids("   ")).toEqual(["1", "2", "3"]);
	});

	it("no match → empty", () => {
		expect(ids("nothing")).toEqual([]);
	});
});

describe("filterMarkers", () => {
	const markers = [
		{ id: "1", categoryId: "a", name: "Color too warm", description: null, responses: [] },
		{ id: "2", categoryId: "b", name: "Too warm here as well", description: null, responses: [] },
		{ id: "3", categoryId: "a", name: "Cut", description: "Shorten", responses: [] },
		{
			id: "4",
			categoryId: "c",
			name: "Audio",
			description: null,
			responses: [{ content: "warm" }],
		},
	];
	const ids = (categoryIds: string[], q: string) =>
		filterMarkers(markers, categoryIds, q).map((x) => x.id);

	it("applies category filter AND search together", () => {
		expect(ids(["a"], "warm")).toEqual(["1"]);
		expect(ids(["a", "c"], "warm")).toEqual(["1", "4"]);
	});

	it("a search match in another category does not show up (regression)", () => {
		expect(ids(["b"], "cut")).toEqual([]);
	});

	it("no category selected → searches all categories", () => {
		expect(ids([], "warm")).toEqual(["1", "2", "4"]);
	});

	it("empty search → only the category filter", () => {
		expect(ids(["a"], "")).toEqual(["1", "3"]);
		expect(ids(["a"], "   ")).toEqual(["1", "3"]);
	});

	it("both empty → everything, in the original order", () => {
		expect(ids([], "")).toEqual(["1", "2", "3", "4"]);
	});

	it("leaves the input untouched", () => {
		const copy = structuredClone(markers);
		filterMarkers(markers, ["a"], "warm");
		expect(markers).toEqual(copy);
	});
});

describe("selectRange", () => {
	const order = ["a", "b", "c", "d", "e"];

	it("selects from anchor to target, in both directions", () => {
		expect(selectRange(order, "b", "d")).toEqual({ selected: ["b", "c", "d"], anchor: "b" });
		expect(selectRange(order, "d", "b")).toEqual({ selected: ["b", "c", "d"], anchor: "d" });
		expect(selectRange(order, "c", "c")).toEqual({ selected: ["c"], anchor: "c" });
	});

	it("without an anchor, selects only the target and anchors there", () => {
		expect(selectRange(order, null, "c")).toEqual({ selected: ["c"], anchor: "c" });
	});

	it("an anchor that is no longer visible (e.g. filtered out) resets", () => {
		expect(selectRange(order, "gone", "c")).toEqual({ selected: ["c"], anchor: "c" });
	});
});
