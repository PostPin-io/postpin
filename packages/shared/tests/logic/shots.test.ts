import { describe, expect, it } from "vitest";
import { getShots } from "../../src/logic/shots.ts";
import type { Clip, Track, TimelineSnapshot } from "../../src/types/TimelineSnapshot.ts";

const clip = (id: string, startFrameIndex: number, durationFrameCount: number): Clip => ({
	id,
	name: `Clip ${id}`,
	mediaId: `media-${id}`,
	startFrameIndex,
	durationFrameCount,
	sourceStartFrameIndex: 0,
	speed: 1,
	metadata: {},
});

const video = (...clips: Clip[]): Track => ({ id: "v", type: "video", name: "Video", clips });
const audio = (...clips: Clip[]): Track => ({ id: "a", type: "audio", name: "Audio", clips });

const snapshot = (...tracks: Track[]): TimelineSnapshot => ({
	id: "timeline",
	name: "Timeline",
	tracks,
	mediaItems: [],
	frameRate: { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false },
	startFrameIndex: 86400,
	durationFrameCount: 0,
	metadata: {},
});

/** [clipId, start, duration] per shot, for compact assertions */
const summary = (s: TimelineSnapshot) =>
	getShots(s).map((shot) => [shot.clipId, shot.startFrameIndex, shot.durationFrameCount]);

describe("getShots", () => {
	it("returns no shots for a timeline without video", () => {
		expect(getShots(snapshot())).toEqual([]);
		expect(getShots(snapshot(video()))).toEqual([]);
		expect(getShots(snapshot(audio(clip("a", 0, 100))))).toEqual([]);
	});

	it("returns one shot per clip on a single track, with all fields", () => {
		const shots = getShots(snapshot(video(clip("a", 86400, 48), clip("b", 86448, 25))));
		expect(shots).toEqual([
			{
				index: 0,
				clipId: "a",
				name: "Clip a",
				startFrameIndex: 86400,
				durationFrameCount: 48,
				thumbnailFrame: 86424,
			},
			{
				index: 1,
				clipId: "b",
				name: "Clip b",
				startFrameIndex: 86448,
				durationFrameCount: 25,
				// odd durations round the middle down
				thumbnailFrame: 86460,
			},
		]);
	});

	it("puts the thumbnail of a one-frame shot on that frame", () => {
		expect(getShots(snapshot(video(clip("a", 10, 1))))[0]!.thumbnailFrame).toBe(10);
	});

	it("does not depend on the order of clips within a track", () => {
		expect(summary(snapshot(video(clip("b", 50, 50), clip("a", 0, 50))))).toEqual([
			["a", 0, 50],
			["b", 50, 50],
		]);
	});

	it("skips gaps without numbering them", () => {
		const shots = getShots(snapshot(video(clip("a", 0, 10), clip("b", 20, 10))));
		expect(shots.map((s) => [s.index, s.clipId, s.startFrameIndex])).toEqual([
			[0, "a", 0],
			[1, "b", 20],
		]);
	});

	it("lets later tracks cover earlier ones and resumes the clip underneath as a new shot", () => {
		expect(summary(snapshot(video(clip("a", 0, 100)), video(clip("b", 40, 20))))).toEqual([
			["a", 0, 40],
			["b", 40, 20],
			["a", 60, 40],
		]);
	});

	it("ignores cuts on lower tracks that are fully covered", () => {
		expect(
			summary(snapshot(video(clip("a", 20, 10), clip("c", 30, 10)), video(clip("b", 0, 50)))),
		).toEqual([["b", 0, 50]]);
	});

	it("merges a top clip across a cut underneath it and recomputes its thumbnail", () => {
		const shots = getShots(
			snapshot(video(clip("a", 0, 100), clip("c", 100, 100)), video(clip("b", 0, 150))),
		);
		expect(shots).toMatchObject([
			{ index: 0, clipId: "b", startFrameIndex: 0, durationFrameCount: 150, thumbnailFrame: 75 },
			{ index: 1, clipId: "c", startFrameIndex: 150, durationFrameCount: 50, thumbnailFrame: 175 },
		]);
	});

	it("fills a gap on the top track with the clip underneath", () => {
		expect(
			summary(snapshot(video(clip("a", 0, 100)), video(clip("b", 0, 30), clip("c", 70, 30)))),
		).toEqual([
			["b", 0, 30],
			["a", 30, 40],
			["c", 70, 30],
		]);
	});

	it("ignores audio tracks, even above the video", () => {
		expect(summary(snapshot(video(clip("a", 0, 100)), audio(clip("x", 10, 10))))).toEqual([
			["a", 0, 100],
		]);
	});

	it("ignores zero-length clips", () => {
		expect(summary(snapshot(video(clip("a", 0, 100)), video(clip("z", 50, 0))))).toEqual([
			["a", 0, 100],
		]);
	});

	it("keeps the topmost of three stacked tracks", () => {
		expect(
			summary(
				snapshot(video(clip("a", 0, 90)), video(clip("b", 30, 60)), video(clip("c", 60, 10))),
			),
		).toEqual([
			["a", 0, 30],
			["b", 30, 30],
			["c", 60, 10],
			["b", 70, 20],
		]);
	});
});
