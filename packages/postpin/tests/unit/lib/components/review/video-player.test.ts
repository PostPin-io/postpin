import { describe, expect, it } from "vitest";
import {
	PLAYBACK_RATES,
	TIMELINE_MODES,
	nextPlaybackRate,
	nextTimelineMode,
	seekToMarker,
} from "#lib/components/review/VideoPlayer.ts";

describe("nextPlaybackRate", () => {
	it("steps through every rate and wraps to the slowest", () => {
		let rate = PLAYBACK_RATES[0]!;
		const seen = [rate];
		for (let i = 0; i < PLAYBACK_RATES.length; i++) seen.push((rate = nextPlaybackRate(rate)));
		expect(seen).toEqual([...PLAYBACK_RATES, PLAYBACK_RATES[0]]);
	});

	it("picks the next faster one for a rate not in the list", () => {
		expect(nextPlaybackRate(0.75)).toBe(1);
		expect(nextPlaybackRate(10)).toBe(0.25);
	});
});

describe("nextTimelineMode", () => {
	it("cycles full → compact → scrub → full", () => {
		expect(TIMELINE_MODES.map(nextTimelineMode)).toEqual(["compact", "scrub", "full"]);
	});
});

describe("seekToMarker", () => {
	const markers = [{ frame: 50 }, { frame: 10 }, { frame: 30 }, { frame: 30 }];

	it.each([
		[1, 0, 10],
		[1, 10, 30],
		[1, 30, 50],
		[1, 50, undefined],
		[-1, 50, 30],
		[-1, 31, 30],
		[-1, 30, 10],
		[-1, 10, undefined],
	] as const)("direction %i from %i → %s (unsorted input)", (dir, pos, frame) => {
		expect(seekToMarker(dir, { markers, playHeadPosition: pos })).toBe(frame);
	});

	it("undefined without markers and leaves the input order alone", () => {
		expect(seekToMarker(1, { markers: [], playHeadPosition: 0 })).toBeUndefined();
		seekToMarker(1, { markers, playHeadPosition: 0 });
		expect(markers.map((m) => m.frame)).toEqual([50, 10, 30, 30]);
	});
});
