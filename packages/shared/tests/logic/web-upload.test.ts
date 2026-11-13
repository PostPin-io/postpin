import { describe, expect, it } from "vitest";
import { getShots } from "../../src/logic/shots.ts";
import { CutListError, type CutList } from "../../src/logic/cut-list.ts";
import {
	applyCuts,
	applyCutList,
	applyProbe,
	cutFrames,
	frameRateLabel,
	isFrameRateOption,
	isWebUpload,
	roundFrameRate,
	webUploadSnapshot,
	type UserSetField,
} from "../../src/logic/web-upload.ts";
import type { FrameRate } from "../../src/types/TimelineSnapshot.ts";

const rate = (fpsNumerator: number, fpsDenominator = 1, dropFrame = false): FrameRate => ({
	fpsNumerator,
	fpsDenominator,
	dropFrame,
});
const FPS_24 = rate(24);
const FPS_25 = rate(25);

function snapshot(
	timing = { frameRate: FPS_24, startFrameIndex: 86400, durationFrameCount: 192 },
	userSet: UserSetField[] = [],
) {
	return webUploadSnapshot({
		id: "exp1",
		name: "Trailer v3",
		fileName: "trailer_v3.mov",
		timing,
		userSet,
		cutLevel: "medium",
	});
}

describe("roundFrameRate", () => {
	it.each([
		[23.976, rate(24000, 1001), false],
		[23.976023976, rate(24000, 1001), false],
		[23.998, FPS_24, false],
		[24, FPS_24, false],
		[25.0001, FPS_25, false],
		// 29.97 and 59.94 suggest drop-frame; a timecode in the file decides later
		[29.97, rate(30000, 1001, true), false],
		[59.94, rate(60000, 1001, true), false],
		[50, rate(50), false],
		[60.0, rate(60), false],
	])("%s → %j", (measured, frameRate, variable) => {
		expect(roundFrameRate(measured)).toEqual({ frameRate, variable });
	});

	it.each([28.3, 119.88, 12, Number.NaN])("%s is flagged as variable", (measured) => {
		expect(roundFrameRate(measured).variable).toBe(true);
	});
});

describe("frame rate options", () => {
	it("knows the offered rates and labels them", () => {
		expect(isFrameRateOption(rate(30000, 1001, true))).toBe(true);
		expect(isFrameRateOption(rate(25, 1, true))).toBe(false);
		expect(isFrameRateOption(rate(48))).toBe(false);
		expect(frameRateLabel(rate(60000, 1001))).toBe("59.94 NDF");
		expect(frameRateLabel(rate(48))).toBe("48");
	});
});

describe("cutFrames", () => {
	// the test video: hard cuts at 2 s, 4 s and 6 s, scores around 0.7, nothing else above 0.1
	const scores: [number, number][] = [
		[48, 0.71],
		[96, 0.69],
		[144, 0.7],
	];

	it.each(["sensitive", "medium", "insensitive"] as const)("%s finds the three cuts", (level) => {
		expect(cutFrames(scores, level, FPS_24, 192)).toEqual([48, 96, 144]);
	});

	it("'none' never cuts", () => {
		expect(cutFrames(scores, "none", FPS_24, 192)).toEqual([]);
	});

	it("applies the level's threshold", () => {
		const mixed: [number, number][] = [
			[30, 0.25],
			[60, 0.35],
			[90, 0.5],
		];
		expect(cutFrames(mixed, "sensitive", FPS_24, 200)).toEqual([30, 60, 90]);
		expect(cutFrames(mixed, "medium", FPS_24, 200)).toEqual([60, 90]);
		expect(cutFrames(mixed, "insensitive", FPS_24, 200)).toEqual([90]);
	});

	it("drops cuts closer than half a second to the previous one, the start or the end", () => {
		const flash: [number, number][] = [
			[5, 0.9], // too close to the start
			[48, 0.8],
			[50, 0.8], // the flash fading out again
			[100, 0.8],
			[190, 0.9], // too close to the end
		];
		expect(cutFrames(flash, "medium", FPS_24, 200)).toEqual([48, 100]);
	});

	it("sorts the scores first", () => {
		expect(
			cutFrames(
				[
					[96, 0.7],
					[48, 0.7],
				],
				"medium",
				FPS_24,
				192,
			),
		).toEqual([48, 96]);
	});
});

describe("webUploadSnapshot", () => {
	it("is one clip over the whole video, marked as an estimate", () => {
		const s = snapshot();
		expect(isWebUpload(s)).toBe(true);
		expect(s).toMatchObject({
			id: "exp1",
			name: "Trailer v3",
			frameRate: FPS_24,
			startFrameIndex: 86400,
			durationFrameCount: 192,
			metadata: {
				source: "web-upload",
				estimated: true,
				userSet: [],
				cutLevel: "medium",
				fileName: "trailer_v3.mov",
			},
		});
		expect(s.tracks).toHaveLength(1);
		expect(s.tracks[0]!.clips).toEqual([
			{
				id: "shot-1",
				name: "trailer_v3.mov",
				mediaId: "upload",
				startFrameIndex: 86400,
				durationFrameCount: 192,
				sourceStartFrameIndex: 86400,
				speed: 1,
				metadata: {},
				color: null,
			},
		]);
		expect(s.mediaItems[0]).toMatchObject({ id: "upload", startTimecode: "01:00:00:00" });
	});

	it("has no clips while the duration is unknown (MXF before probing)", () => {
		const s = snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 0 });
		expect(s.tracks[0]!.clips).toEqual([]);
		expect(getShots(s)).toEqual([]);
	});

	it("is not confused with a plugin's snapshot", () => {
		expect(isWebUpload({ metadata: {} })).toBe(false);
		expect(isWebUpload(null)).toBe(false);
	});
});

describe("applyProbe", () => {
	it("replaces the estimates with the file's values", () => {
		const probed = applyProbe(
			snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 100 }),
			{ fps: 23.976, timecode: "01:00:00:00", frameCount: 240, durationSeconds: 10.01 },
		);
		expect(probed).toMatchObject({
			frameRate: rate(24000, 1001),
			startFrameIndex: 86400,
			durationFrameCount: 240,
		});
		expect(probed.tracks[0]!.clips[0]).toMatchObject({
			startFrameIndex: 86400,
			durationFrameCount: 240,
		});
	});

	it("takes drop-frame from the timecode", () => {
		const probed = applyProbe(snapshot(), {
			fps: 29.97,
			timecode: "00:59:58;00",
			frameCount: null,
			durationSeconds: 2,
		});
		expect(probed.frameRate).toEqual(rate(30000, 1001, true));
		expect(probed.startFrameIndex).toBe(107832);
		expect(probed.durationFrameCount).toBe(60);
	});

	it("a non-drop timecode at 29.97 means NDF", () => {
		const probed = applyProbe(snapshot(), {
			fps: 29.97,
			timecode: "01:00:00:00",
			frameCount: 30,
			durationSeconds: null,
		});
		expect(probed.frameRate).toEqual(rate(30000, 1001));
		expect(probed.startFrameIndex).toBe(108000);
	});

	it("keeps what the uploader set, the duration still comes from the file", () => {
		const probed = applyProbe(
			snapshot({ frameRate: FPS_25, startFrameIndex: 90000, durationFrameCount: 100 }, [
				"frameRate",
				"startFrameIndex",
			]),
			{ fps: 23.976, timecode: "10:00:00:00", frameCount: null, durationSeconds: 8 },
		);
		expect(probed).toMatchObject({
			frameRate: FPS_25,
			startFrameIndex: 90000,
			durationFrameCount: 200,
		});
		expect(probed.metadata.userSet).toEqual(["frameRate", "startFrameIndex"]);
	});

	it("parses the file's timecode at the uploader's rate", () => {
		const probed = applyProbe(
			snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 100 }, ["frameRate"]),
			{ fps: 50, timecode: "10:00:00:00", frameCount: 400, durationSeconds: 8 },
		);
		expect(probed.frameRate).toEqual(FPS_25);
		expect(probed.startFrameIndex).toBe(900000);
	});

	it("keeps the estimates where ffprobe found nothing", () => {
		const before = snapshot({ frameRate: FPS_25, startFrameIndex: 250, durationFrameCount: 100 });
		const probed = applyProbe(before, {
			fps: null,
			timecode: null,
			frameCount: null,
			durationSeconds: null,
		});
		expect(probed).toMatchObject({
			frameRate: FPS_25,
			startFrameIndex: 250,
			durationFrameCount: 100,
		});
	});

	it("ignores a timecode that doesn't fit the rate", () => {
		const probed = applyProbe(snapshot(), {
			fps: 25,
			timecode: "01:00:00:29",
			frameCount: 50,
			durationSeconds: null,
		});
		expect(probed.startFrameIndex).toBe(86400);
	});
});

describe("applyProbe: length at the uploader's frame rate", () => {
	const FPS_23976 = rate(24000, 1001);
	const userRate = (frameRate: ReturnType<typeof rate>) =>
		snapshot({ frameRate, startFrameIndex: 0, durationFrameCount: 1 }, ["frameRate"]);

	it("24 fps file, 25 chosen: the same seconds at 25, not the file's frame count", () => {
		const probed = applyProbe(userRate(FPS_25), {
			fps: 24,
			timecode: null,
			frameCount: 192,
			durationSeconds: 8,
		});
		expect(probed).toMatchObject({ frameRate: FPS_25, durationFrameCount: 200 });
		expect(probed.tracks[0]!.clips.at(-1)).toMatchObject({ durationFrameCount: 200 });
	});

	it("23.976 file, 24 chosen: counted from the duration, the rates differ", () => {
		const probed = applyProbe(userRate(FPS_24), {
			fps: 24000 / 1001,
			timecode: null,
			frameCount: 2400,
			durationSeconds: 100.1,
		});
		// 2400 frames at 23.976 last 100.1 s, which are 2402 frames at 24
		expect(probed).toMatchObject({ frameRate: FPS_24, durationFrameCount: 2402 });
	});

	it("the same rate as the file: the file's frame count, even if the duration says otherwise", () => {
		const probed = applyProbe(userRate(FPS_24), {
			fps: 24,
			timecode: null,
			frameCount: 192,
			durationSeconds: 8.04,
		});
		expect(probed.durationFrameCount).toBe(192);
	});

	it("a measured rate that rounds to the chosen one counts as the same", () => {
		const probed = applyProbe(userRate(FPS_24), {
			fps: 23.999,
			timecode: null,
			frameCount: 192,
			durationSeconds: 8.04,
		});
		expect(probed.durationFrameCount).toBe(192);
	});

	it("a variable rate is only an average: the length comes from the duration", () => {
		// 27.3 fps on average rounds to 25, but its 273 frames last 10 s, not 273 / 25
		const probed = applyProbe(
			snapshot({ frameRate: FPS_24, startFrameIndex: 0, durationFrameCount: 1 }),
			{ fps: 27.3, timecode: null, frameCount: 273, durationSeconds: 10 },
		);
		expect(probed).toMatchObject({ frameRate: FPS_25, durationFrameCount: 250 });
	});

	it("without a duration, the file's frames are converted to the chosen rate", () => {
		const probed = applyProbe(userRate(FPS_25), {
			fps: 24,
			timecode: null,
			frameCount: 192,
			durationSeconds: null,
		});
		expect(probed.durationFrameCount).toBe(200);
	});

	it("neither duration nor rate known: the file's frame count is the best there is", () => {
		const probed = applyProbe(userRate(FPS_25), {
			fps: null,
			timecode: null,
			frameCount: 192,
			durationSeconds: null,
		});
		expect(probed.durationFrameCount).toBe(192);
	});

	it("rate not chosen by the uploader: it follows the file, and so does the frame count", () => {
		const probed = applyProbe(
			snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 1 }),
			{ fps: 24000 / 1001, timecode: null, frameCount: 2400, durationSeconds: 100.1 },
		);
		expect(probed).toMatchObject({ frameRate: FPS_23976, durationFrameCount: 2400 });
	});
});

describe("applyCuts", () => {
	const scores = {
		scores: [
			[48, 0.7],
			[96, 0.25],
			[144, 0.7],
		] as [number, number][],
	};

	it("splits the video into estimated shots and remembers the level", () => {
		const cut = applyCuts(snapshot(), scores, "medium");
		expect(cut.metadata.cutLevel).toBe("medium");
		expect(
			cut.tracks[0]!.clips.map((c) => [c.name, c.startFrameIndex, c.durationFrameCount]),
		).toEqual([
			["Shot 1 (estimated)", 86400, 48],
			["Shot 2 (estimated)", 86448, 96],
			["Shot 3 (estimated)", 86544, 48],
		]);
		expect(getShots(cut).map((s) => s.startFrameIndex)).toEqual([86400, 86448, 86544]);
	});

	it("can go back to one clip and to another level", () => {
		const none = applyCuts(applyCuts(snapshot(), scores, "sensitive"), scores, "none");
		expect(none.tracks[0]!.clips).toHaveLength(1);
		expect(none.metadata.cutLevel).toBe("none");
		expect(applyCuts(none, scores, "sensitive").tracks[0]!.clips).toHaveLength(4);
	});

	it("without scores the video stays one clip", () => {
		expect(applyCuts(snapshot(), null, "medium").tracks[0]!.clips).toHaveLength(1);
	});
});

describe("applyCutList", () => {
	const applyTracks = (...a: Parameters<typeof applyCutList>) => applyCutList(...a).snapshot;
	// 25 fps, 01:00:00:00 = 90000, 200 frames long
	const base = () =>
		snapshot({ frameRate: FPS_25, startFrameIndex: 90000, durationFrameCount: 200 });
	const event = (name: string | null, from: string, to: string) => ({
		name,
		in: from,
		out: to,
		sourceIn: "00:10:00:00",
	});
	const list = (tracks: CutList["tracks"], frameRate: CutList["frameRate"] = null): CutList => ({
		format: "edl",
		title: "x",
		frameRate,
		tracks,
		markers: [],
	});
	const v = (...events: ReturnType<typeof event>[]) => ({
		type: "video" as const,
		name: "Video",
		events,
	});
	const a = (...events: ReturnType<typeof event>[]) => ({
		type: "audio" as const,
		name: "Audio",
		events,
	});
	const clipsOf = (s: ReturnType<typeof applyCutList>) =>
		s.tracks.map((t) => [
			t.id,
			t.type,
			t.clips.map((c) => [c.name, c.startFrameIndex, c.durationFrameCount]),
		]);

	it("the list's tracks become the snapshot's, so the topmost video clips are the shots", () => {
		const s = applyTracks(
			base(),
			list([
				v(event("A001.mov", "01:00:00:00", "01:00:08:00")),
				v(event("B-roll.mov", "01:00:02:00", "01:00:03:00")),
				a(event("Music.wav", "01:00:00:00", "01:00:08:00")),
			]),
		);
		expect(clipsOf(s)).toEqual([
			["V1", "video", [["A001.mov", 90000, 200]]],
			["V2", "video", [["B-roll.mov", 90050, 25]]],
			["A1", "audio", [["Music.wav", 90000, 200]]],
		]);
		expect(s.metadata.cutsFrom).toBe("edl");
		expect(getShots(s).map((shot) => [shot.name, shot.startFrameIndex])).toEqual([
			["A001.mov", 90000],
			["B-roll.mov", 90050],
			["A001.mov", 90075],
		]);
		// a part of the uploaded video; the source timecode is metadata
		expect(s.tracks[0]!.clips[0]).toMatchObject({
			mediaId: "upload",
			sourceStartFrameIndex: 90000,
			metadata: { sourceTimecode: "00:10:00:00" },
		});
	});

	it("names clips without a name after their place", () => {
		const s = applyTracks(base(), list([v(event(null, "01:00:00:00", "01:00:08:00"))]));
		expect(s.tracks[0]!.clips[0]!.name).toBe("Clip 1");
	});

	it("moves a list that starts outside the video to the video's start, every track alike", () => {
		// a file without timecode starts at 0, the list at 01:00:00:00
		const s = applyTracks(
			snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 200 }),
			list([
				v(event("A", "01:00:00:00", "01:00:04:00"), event("B", "01:00:04:00", "01:00:08:00")),
				a(event("S", "01:00:01:00", "01:00:02:00")),
			]),
		);
		expect(clipsOf(s)).toEqual([
			[
				"V1",
				"video",
				[
					["A", 0, 100],
					["B", 100, 100],
				],
			],
			["A1", "audio", [["S", 25, 25]]],
		]);
	});

	it("sorts, cuts overlaps on a track and what runs past the end, and drops empty tracks", () => {
		const s = applyTracks(
			base(),
			list([
				v(event("2", "01:00:04:00", "01:00:12:00"), event("1", "01:00:00:00", "01:00:04:20")),
				a(event("late", "01:00:20:00", "01:00:21:00")),
			]),
		);
		expect(clipsOf(s)).toEqual([
			[
				"V1",
				"video",
				[
					["1", 90000, 120],
					["2", 90120, 80],
				],
			],
		]);
	});

	it("an FCPXML at another rate: the clips are placed by time", () => {
		// 24 fps timecodes on a 25 fps video: 01:00:04:00 is 4 s in, 100 frames at 25
		const s = applyTracks(
			base(),
			list(
				[v(event("A", "01:00:00:00", "01:00:04:00"), event("B", "01:00:04:00", "01:00:08:00"))],
				FPS_24,
			),
		);
		expect(clipsOf(s)).toEqual([
			[
				"V1",
				"video",
				[
					["A", 90000, 100],
					["B", 90100, 100],
				],
			],
		]);
	});

	it.each([
		[
			"a timecode that doesn't exist at the rate",
			[v(event("A", "01:00:00:29", "01:00:01:00"))],
			/doesn't fit/,
		],
		["no video clip with a length", [v(event("A", "01:00:01:00", "01:00:01:00"))], /No video clip/],
	])("throws for %s", (_, tracks, message) => {
		expect(() => applyTracks(base(), list(tracks))).toThrow(CutListError);
		expect(() => applyTracks(base(), list(tracks))).toThrow(message);
	});

	describe("markers", () => {
		const marker = (at: string, over: Partial<CutList["markers"][number]> = {}) => ({
			name: "Fix",
			note: "too warm",
			at,
			duration: 0,
			host: "Resolve" as const,
			label: "Blue",
			...over,
		});
		const withMarkers = (
			markers: CutList["markers"],
			tracks = [v(event("A", "01:00:00:00", "01:00:08:00"))],
		) => ({
			...list(tracks),
			markers,
		});

		it("are placed on the video with their category", () => {
			const { markers } = applyCutList(
				base(),
				withMarkers([
					marker("01:00:02:00"),
					marker("01:00:04:00", { duration: 50, host: "Avid", label: "RED", note: null }),
				]),
			);
			expect(markers).toEqual([
				{
					index: 0,
					name: "Fix",
					description: "too warm",
					frame: 90050,
					duration: 0,
					category: { name: "Resolve Blue", color: "#008feb" },
				},
				{
					index: 1,
					name: "Fix",
					description: null,
					frame: 90100,
					duration: 50,
					category: { name: "Avid Red", color: "#ff0000" },
				},
			]);
		});

		it("move with the clips, and outside the video they are left out; a range ends with it", () => {
			const s = snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 200 });
			const { markers } = applyCutList(
				s,
				withMarkers([
					marker("01:00:01:00"),
					marker("01:00:07:00", { duration: 100 }),
					marker("01:00:09:00"),
				]),
			);
			expect(markers.map((m) => [m.index, m.frame, m.duration])).toEqual([
				[0, 25, 0],
				[1, 175, 25],
			]);
		});

		it("an FCPXML at another rate: placed by time", () => {
			const { markers } = applyCutList(base(), {
				...withMarkers([marker("01:00:04:00", { duration: 24 })]),
				frameRate: FPS_24,
			});
			expect(markers.map((m) => [m.frame, m.duration])).toEqual([[90100, 25]]);
		});

		it("a list with only markers keeps the tracks, and moves by whole hours", () => {
			// a file without timecode starts at 0, the markers are in the list's first hour
			const s = snapshot({ frameRate: FPS_25, startFrameIndex: 0, durationFrameCount: 200 });
			const applied = applyCutList(s, withMarkers([marker("01:00:03:00")], []));
			expect(applied.snapshot).toBe(s);
			expect(applied.markers.map((m) => m.frame)).toEqual([75]);
		});

		it("throws when neither a clip nor a marker is inside the video", () => {
			// the video is 8 s long; the marker is in its hour, after its end
			expect(() => applyCutList(base(), withMarkers([marker("01:00:30:00")], []))).toThrow(
				/No marker/,
			);
		});

		it("throws for a marker whose timecode doesn't fit the rate", () => {
			expect(() => applyCutList(base(), withMarkers([marker("01:00:00:29")]))).toThrow(
				'Marker "Fix": 01:00:00:29 doesn\'t fit',
			);
		});
	});
});
