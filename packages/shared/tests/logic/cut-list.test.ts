import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	checkCutList,
	CUT_LIST_MAX_BYTES,
	CutListError,
	cutListSchema,
	cutListSummary,
	cutListTracks,
	type CutList,
} from "../../src/logic/cut-list.ts";

const FPS_25 = { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };
const event = { name: "A", in: "01:00:00:00", out: "01:00:01:00", sourceIn: "00:00:00:00" };
const list = (over: Partial<CutList> = {}): CutList => ({
	format: "edl",
	title: "x",
	frameRate: null,
	tracks: [
		{
			type: "video",
			name: "Video 1",
			events: [event, { ...event, in: "01:00:01:00", out: "01:00:02:00" }],
		},
		{ type: "audio", name: "Audio 1", events: [event] },
	],
	markers: [],
	...over,
});
const marker = {
	name: "Fix",
	note: null,
	at: "01:00:00:10",
	duration: 0,
	host: "Resolve" as const,
	label: "Blue",
};

describe("cutListTracks", () => {
	it("V1… and A1… with absolute frames at the timeline's rate", () => {
		const tracks = cutListTracks(list(), FPS_25, "upload");
		expect(tracks.map((t) => [t.id, t.type, t.name])).toEqual([
			["V1", "video", "Video 1"],
			["A1", "audio", "Audio 1"],
		]);
		expect(tracks[0]!.clips.map((c) => [c.id, c.startFrameIndex, c.durationFrameCount])).toEqual([
			["V1-1", 90000, 25],
			["V1-2", 90025, 25],
		]);
	});

	it("names the track and clip whose timecode doesn't fit", () => {
		const bad = list({
			tracks: [{ type: "video", name: "Video 1", events: [{ ...event, out: "01:00:00:29" }] }],
		});
		expect(() => cutListTracks(bad, FPS_25, "upload")).toThrow(
			"Video 1, clip 1: 01:00:00:29 doesn't fit",
		);
	});
});

describe("cutListSummary", () => {
	it("counts tracks and clips by type", () => {
		expect(cutListSummary(list())).toEqual({
			videoTracks: 1,
			audioTracks: 1,
			videoClips: 2,
			audioClips: 1,
			markers: 0,
		});
	});
});

describe("checkCutList", () => {
	it("accepts a list with only markers", () => {
		expect(() => checkCutList(list({ tracks: [], markers: [marker] }))).not.toThrow();
	});

	it("accepts what fits some rate the form offers", () => {
		expect(() =>
			checkCutList(
				list({
					tracks: [{ type: "video", name: "V", events: [{ ...event, out: "01:00:00:59" }] }],
				}),
			),
		).not.toThrow();
	});

	it.each([
		[
			"no video clip",
			list({ tracks: [{ type: "audio", name: "A", events: [event] }] }),
			/no video clips/,
		],
		[
			"too many bytes",
			list({
				tracks: [
					{
						type: "video",
						name: "V",
						events: Array.from({ length: Math.ceil(CUT_LIST_MAX_BYTES / 60) }, () => event),
					},
				],
			}),
			/too large/,
		],
	])("rejects %s", (_, l, message) => {
		expect(() => checkCutList(l)).toThrow(CutListError);
		expect(() => checkCutList(l)).toThrow(message);
	});
});

describe("cutListSchema", () => {
	it("takes a cut list", () => {
		expect(v.parse(cutListSchema, list({ markers: [marker] }))).toEqual(
			list({ markers: [marker] }),
		);
	});

	it("markers are optional", () => {
		const { markers: _, ...without } = list();
		expect(v.parse(cutListSchema, without).markers).toEqual([]);
	});

	it.each([
		[
			"a timecode that is none",
			{ ...list(), tracks: [{ type: "video", name: "V", events: [{ ...event, in: "1:00" }] }] },
		],
		["an unknown track type", { ...list(), tracks: [{ type: "subtitle", name: "S", events: [] }] }],
		["too many tracks", { ...list(), tracks: Array.from({ length: 65 }, () => list().tracks[0]) }],
		["an unknown format", { ...list(), format: "aaf" }],
		["a marker from an unknown host", { ...list(), markers: [{ ...marker, host: "Avid Pro" }] }],
		["a negative marker length", { ...list(), markers: [{ ...marker, duration: -1 }] }],
	])("rejects %s", (_, input) => {
		expect(v.safeParse(cutListSchema, input).success).toBe(false);
	});
});
