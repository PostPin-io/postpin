import { describe, expect, it } from "vitest";
import {
	DEFAULT_LAYOUT,
	MAX_STORED_PLAYHEADS,
	normalizeSizes,
	parsePaneLayout,
	parsePlayheads,
	parseQuality,
	parseTimelineMode,
	seekThumbnailTiles,
	withPlayhead,
} from "#lib/components/review/export-view.ts";

describe("parsePaneLayout", () => {
	it("defaults when nothing is stored", () => {
		expect(parsePaneLayout(null)).toEqual(DEFAULT_LAYOUT);
	});

	it("returns copies, never the shared defaults", () => {
		const layout = parsePaneLayout(null);
		layout.main[0] = 1;
		expect(DEFAULT_LAYOUT.main).toEqual([75, 25]);
	});

	it("keeps valid stored sizes", () => {
		expect(parsePaneLayout(JSON.stringify({ main: [60, 40], left: [100, 0] }))).toEqual({
			main: [60, 40],
			left: [100, 0],
		});
	});

	it.each([
		["wrong count", [1, 2, 3]],
		["negative", [-1, 101]],
		["NaN as null", [null, 50]],
		["all zero", [0, 0]],
		["strings", ["50", "50"]],
		["not an array", 50],
	])("falls back per key for %s", (_, main) => {
		expect(parsePaneLayout(JSON.stringify({ main, left: [50, 50] }))).toEqual({
			main: DEFAULT_LAYOUT.main,
			left: [50, 50],
		});
	});

	it.each(["{", "[]", '"x"', "42"])("defaults for unusable JSON %j", (raw) => {
		expect(parsePaneLayout(raw)).toEqual(DEFAULT_LAYOUT);
	});
});

describe("normalizeSizes", () => {
	it("scales to 100", () => {
		expect(normalizeSizes([1, 3])).toEqual([25, 75]);
		expect(normalizeSizes([75, 25])).toEqual([75, 25]);
	});

	it("splits evenly when everything is zero", () => {
		expect(normalizeSizes([0, 0])).toEqual([50, 50]);
		expect(normalizeSizes([0, 0, 0])[0]).toBeCloseTo(33.333);
	});
});

describe("parseQuality", () => {
	it.each([
		["1080", 1080],
		["720", 720],
		[null, "auto"],
		["auto", "auto"],
		["0", "auto"],
		["-5", "auto"],
		["", "auto"],
	] as const)("%j → %j", (raw, quality) => {
		expect(parseQuality(raw)).toBe(quality);
	});
});

describe("parseTimelineMode", () => {
	it.each(["full", "compact", "hidden"])("accepts %s", (mode) => {
		expect(parseTimelineMode(mode)).toBe(mode);
	});

	it.each([null, "", "FULL", "other"])("defaults %j to full", (raw) => {
		expect(parseTimelineMode(raw)).toBe("full");
	});
});

describe("seekThumbnailTiles", () => {
	const sprites = {
		interval: 2,
		tileWidth: 160,
		tileHeight: 90,
		columns: 3,
		rows: 2,
		count: 8,
		sheets: 2,
	};

	it("lays tiles out row by row and moves to the next sheet after columns × rows", () => {
		const tiles = seekThumbnailTiles(sprites, ["s0", "s1"]);
		expect(tiles).toHaveLength(8);
		expect(tiles.map((t) => [t.url, t.coords?.x, t.coords?.y])).toEqual([
			["s0", 0, 0],
			["s0", 160, 0],
			["s0", 320, 0],
			["s0", 0, 90],
			["s0", 160, 90],
			["s0", 320, 90],
			["s1", 0, 0],
			["s1", 160, 0],
		]);
	});

	it("gives each tile its time window", () => {
		const tiles = seekThumbnailTiles(sprites, ["s0", "s1"]);
		expect(tiles[3]).toMatchObject({ startTime: 6, endTime: 8, width: 160, height: 90 });
	});

	it("empty without sheet URLs", () => {
		expect(seekThumbnailTiles(sprites, [])).toEqual([]);
	});
});

describe("parsePlayheads", () => {
	it("is empty for missing or broken data", () => {
		expect(parsePlayheads(null)).toEqual({});
		expect(parsePlayheads("{nope")).toEqual({});
		expect(parsePlayheads("[1, 2]")).toEqual({});
	});

	it("keeps only valid positions", () => {
		expect(parsePlayheads(JSON.stringify({ a: 12.5, b: "3", c: -1, d: 0 }))).toEqual({
			a: 12.5,
			d: 0,
		});
	});
});

describe("withPlayhead", () => {
	it("moves the saved export to the end", () => {
		expect(Object.keys(withPlayhead({ a: 1, b: 2 }, "a", 5))).toEqual(["b", "a"]);
		expect(withPlayhead({ a: 1, b: 2 }, "a", 5).a).toBe(5);
	});

	it("drops the oldest entries beyond the limit", () => {
		const full = Object.fromEntries(
			Array.from({ length: MAX_STORED_PLAYHEADS }, (_, i) => [`e${i}`, i]),
		);
		const next = withPlayhead(full, "new", 1);
		expect(Object.keys(next)).toHaveLength(MAX_STORED_PLAYHEADS);
		expect(next.e0).toBeUndefined();
		expect(next.new).toBe(1);
	});
});
