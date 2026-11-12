import { describe, expect, it } from "vitest";
import type { Clip, Track } from "@postpin-io/shared/types/TimelineSnapshot";
import {
	adjacentCut,
	buildLanes,
	clipStyle,
	collapsedLaneCount,
	dragRange,
	orderMarks,
	rangeFromMarks,
	stepPlaybackRate,
	tickStep,
	timelineCuts,
	visibleTicks,
} from "#lib/components/review/timeline-view.ts";

const clip = (id: string, start: number, duration: number): Clip => ({
	id,
	name: id,
	mediaId: null,
	startFrameIndex: start,
	durationFrameCount: duration,
	sourceStartFrameIndex: null,
	speed: 1,
	metadata: {},
	color: null,
});

const track = (id: string, type: "video" | "audio", clips: Clip[] = []): Track => ({
	id,
	type,
	name: id,
	clips,
});

const tracks = [
	track("V1", "video", [clip("a", 0, 100)]),
	track("V2", "video", [clip("b", 50, 20)]),
	track("A1", "audio", [clip("c", 0, 150)]),
];

describe("buildLanes", () => {
	it("full: video highest first, then audio in order", () => {
		expect(buildLanes(tracks, "full").map((l) => l.id)).toEqual(["V2", "V1", "A1"]);
	});

	it("full: does not reorder the snapshot's tracks", () => {
		buildLanes(tracks, "full");
		expect(tracks.map((t) => t.id)).toEqual(["V1", "V2", "A1"]);
	});

	it("compact: one lane per type, higher tracks' clips last (drawn on top)", () => {
		const lanes = buildLanes(tracks, "compact");
		expect(lanes.map((l) => [l.id, l.name, l.clips.map((c) => c.id)])).toEqual([
			["video", "Video", ["a", "b"]],
			["audio", "Audio", ["c"]],
		]);
	});

	it("compact: leaves out types without tracks", () => {
		expect(buildLanes([tracks[2]!], "compact").map((l) => l.id)).toEqual(["audio"]);
	});

	it("scrub: no lanes", () => {
		expect(buildLanes(tracks, "scrub")).toEqual([]);
	});
});

describe("collapsedLaneCount", () => {
	it("counts present track types, independent of mode full/compact", () => {
		expect(collapsedLaneCount(tracks, "full")).toBe(2);
		expect(collapsedLaneCount(tracks, "compact")).toBe(2);
		expect(collapsedLaneCount([tracks[0]!, tracks[1]!], "compact")).toBe(1);
		expect(collapsedLaneCount([], "compact")).toBe(0);
		expect(collapsedLaneCount(tracks, "scrub")).toBe(0);
	});
});

describe("timelineCuts / adjacentCut", () => {
	// timeline 1000..1149
	const t = [
		track("V1", "video", [clip("a", 1000, 100), clip("b", 1100, 50)]),
		track("V2", "video", [clip("c", 1050, 20)]),
	];
	const cuts = timelineCuts(t, 1000, 1149);

	it("sorted, unique, with ends clamped to the last frame", () => {
		expect(cuts).toEqual([1000, 1050, 1070, 1100, 1149]);
	});

	it.each([
		[1000, 1, 1050],
		[1060, 1, 1070],
		[1149, 1, undefined],
		[1060, -1, 1050],
		[1050, -1, 1000],
		[1000, -1, undefined],
	] as const)("from %i direction %i → %s", (pos, dir, expected) => {
		expect(adjacentCut(cuts, pos, dir)).toBe(expected);
	});
});

describe("stepPlaybackRate", () => {
	it.each([
		[1, 1, 1.5],
		[1, -1, 0.5],
		[4, 1, 4],
		[0.25, -1, 0.25],
		// between steps: snaps to the next higher rate, then steps
		[0.75, 1, 1.5],
		[0.75, -1, 0.5],
		// beyond the list
		[8, -1, 2],
	] as const)("%d, %i → %d", (rate, dir, expected) => {
		expect(stepPlaybackRate(rate, dir)).toBe(expected);
	});
});

describe("tickStep", () => {
	it("uses frame steps when zoomed in", () => {
		expect(tickStep(100, 25, 100)).toBe(1);
		expect(tickStep(30, 25, 100)).toBe(5);
	});

	it("switches to seconds (in frames) when zoomed out", () => {
		expect(tickStep(5, 25, 100)).toBe(25);
		expect(tickStep(1, 25, 100)).toBe(125);
	});

	it("rounds non-integer frame rates", () => {
		expect(tickStep(5, 29.97, 100)).toBe(30);
	});

	it("falls back to the largest step when nothing fits (or nothing is laid out)", () => {
		expect(tickStep(0, 25, 100)).toBe(3600 * 25);
		expect(tickStep(0.00001, 25, 100)).toBe(3600 * 25);
	});
});

describe("visibleTicks", () => {
	const base = {
		scrollLeft: 0,
		viewportWidth: 500,
		pixelsPerFrame: 10,
		tickFrames: 10,
		durationFrameCount: 1000,
		firstFrame: 86400,
	};

	it("ticks in the viewport, in absolute frames", () => {
		expect(visibleTicks(base)).toEqual([86400, 86410, 86420, 86430, 86440, 86450]);
	});

	it("follows scrolling", () => {
		expect(visibleTicks({ ...base, scrollLeft: 1000 })[0]).toBe(86500);
	});

	it("stops at the end of the timeline", () => {
		const ticks = visibleTicks({ ...base, scrollLeft: 9800 });
		expect(ticks.at(-1)).toBe(86400 + 990);
	});

	it("empty before layout", () => {
		expect(visibleTicks({ ...base, pixelsPerFrame: 0 })).toEqual([]);
	});
});

describe("clipStyle", () => {
	it("uses the clip's color, with readable text", () => {
		const yellow = { ...clip("y", 0, 10), color: { name: "Lemon", hex: "#dfec53" } };
		expect(clipStyle(yellow, "video")).toBe("background-color: #dfec53; color: #000000;");
		const navy = { ...clip("n", 0, 10), color: { name: "Navy", hex: "#006086" } };
		expect(clipStyle(navy, "video")).toBe("background-color: #006086; color: #ffffff;");
	});

	it("falls back to the track type's color for clips without one", () => {
		expect(clipStyle(clip("v", 0, 10), "video")).toBe("background-color: #3b82f6; color: #ffffff;");
		expect(clipStyle(clip("a", 0, 10), "audio")).toBe("background-color: #16a34a; color: #ffffff;");
	});
});

// Timeline 100 … 199
const bounds = { first: 100, last: 199 };

describe("dragRange", () => {
	it("moving keeps the duration", () => {
		expect(dragRange({ frame: 120, duration: 10 }, "move", 5, bounds)).toEqual({
			frame: 125,
			duration: 10,
		});
	});

	it("moving stops with the end on the last frame", () => {
		expect(dragRange({ frame: 150, duration: 50 }, "move", 30, bounds)).toEqual({
			frame: 150,
			duration: 50,
		});
		expect(dragRange({ frame: 140, duration: 50 }, "move", 30, bounds)).toEqual({
			frame: 150,
			duration: 50,
		});
	});

	it("a point marker moves up to the last frame", () => {
		expect(dragRange({ frame: 190, duration: 0 }, "move", 30, bounds)).toEqual({
			frame: 199,
			duration: 0,
		});
	});

	it("moving stops at the first frame", () => {
		expect(dragRange({ frame: 110, duration: 10 }, "move", -30, bounds)).toEqual({
			frame: 100,
			duration: 10,
		});
	});

	it("dragging the start keeps the end", () => {
		// 120 … 129
		expect(dragRange({ frame: 120, duration: 10 }, "start", -5, bounds)).toEqual({
			frame: 115,
			duration: 15,
		});
	});

	it("the start pushed onto the end makes it a point marker there", () => {
		expect(dragRange({ frame: 120, duration: 10 }, "start", 9, bounds)).toEqual({
			frame: 129,
			duration: 0,
		});
		expect(dragRange({ frame: 120, duration: 10 }, "start", 50, bounds)).toEqual({
			frame: 129,
			duration: 0,
		});
	});

	it("grabbing an edge without moving it leaves a 1 frame range as it is", () => {
		expect(dragRange({ frame: 120, duration: 1 }, "start", 0, bounds)).toEqual({
			frame: 120,
			duration: 1,
		});
		expect(dragRange({ frame: 120, duration: 1 }, "end", 0, bounds)).toEqual({
			frame: 120,
			duration: 1,
		});
	});

	it("the start stops at the first frame", () => {
		expect(dragRange({ frame: 120, duration: 10 }, "start", -50, bounds)).toEqual({
			frame: 100,
			duration: 30,
		});
	});

	it("dragging the end keeps the start", () => {
		expect(dragRange({ frame: 120, duration: 10 }, "end", 5, bounds)).toEqual({
			frame: 120,
			duration: 15,
		});
	});

	it("the end pushed onto the start makes it a point marker, the end stops at the last frame", () => {
		expect(dragRange({ frame: 120, duration: 10 }, "end", -9, bounds)).toEqual({
			frame: 120,
			duration: 0,
		});
		expect(dragRange({ frame: 120, duration: 10 }, "end", -50, bounds)).toEqual({
			frame: 120,
			duration: 0,
		});
		expect(dragRange({ frame: 120, duration: 10 }, "end", 500, bounds)).toEqual({
			frame: 120,
			duration: 80,
		});
	});
});

describe("dragRange: span", () => {
	it("dragging a point marker right makes a range from it to the pointer", () => {
		expect(dragRange({ frame: 120, duration: 0 }, "span", 9, bounds)).toEqual({
			frame: 120,
			duration: 10,
		});
	});

	it("dragging left makes the range end on the marker", () => {
		expect(dragRange({ frame: 120, duration: 0 }, "span", -9, bounds)).toEqual({
			frame: 111,
			duration: 10,
		});
	});

	it("back on the marker it is a point marker again", () => {
		expect(dragRange({ frame: 120, duration: 0 }, "span", 0, bounds)).toEqual({
			frame: 120,
			duration: 0,
		});
	});

	it("stays on the timeline", () => {
		expect(dragRange({ frame: 120, duration: 0 }, "span", 500, bounds)).toEqual({
			frame: 120,
			duration: 80,
		});
		expect(dragRange({ frame: 120, duration: 0 }, "span", -500, bounds)).toEqual({
			frame: 100,
			duration: 21,
		});
	});
});

describe("orderMarks", () => {
	it("keeps in before out", () => {
		expect(orderMarks({ in: 10, out: 20 })).toEqual({ in: 10, out: 20 });
	});

	it("swaps out before in", () => {
		expect(orderMarks({ in: 20, out: 10 })).toEqual({ in: 10, out: 20 });
	});

	it("leaves a single mark alone", () => {
		expect(orderMarks({ in: 20, out: null })).toEqual({ in: 20, out: null });
		expect(orderMarks({ in: null, out: 10 })).toEqual({ in: null, out: 10 });
	});
});

describe("rangeFromMarks", () => {
	it("in to out, with out inclusive", () => {
		expect(rangeFromMarks({ in: 10, out: 19 }, 50)).toEqual({ frame: 10, duration: 10 });
	});

	it("in equal to out is a one-frame range", () => {
		expect(rangeFromMarks({ in: 10, out: 10 }, 50)).toEqual({ frame: 10, duration: 1 });
	});

	it("only in: a point marker at the in point", () => {
		expect(rangeFromMarks({ in: 10, out: null }, 50)).toEqual({ frame: 10, duration: 0 });
	});

	it("no in: a point marker at the playhead", () => {
		expect(rangeFromMarks({ in: null, out: null }, 50)).toEqual({ frame: 50, duration: 0 });
		expect(rangeFromMarks({ in: null, out: 60 }, 50)).toEqual({ frame: 50, duration: 0 });
	});
});
