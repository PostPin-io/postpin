import { describe, expect, it } from "vitest";
import {
	buildSnapshot,
	DEFAULT_MARKER_COLOR,
	parseFrameRate,
	timingOf,
	toBridgeMarker,
	toNleMarker,
	videoRenderFormat,
	type ProjectInfo,
} from "../../src/adapters/reaper/convert.ts";

const project = (overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
	id: "{P}",
	path: "/Music/Film/Mix.rpp",
	name: "Mix.rpp",
	frameRate: 25,
	dropFrame: false,
	offset: 3600,
	length: 60,
	...overrides,
});

describe("parseFrameRate", () => {
	it.each([
		[25, false, 25, 1],
		[24, false, 24, 1],
		[29.97, true, 30000, 1001],
		[29.97002997, false, 30000, 1001],
		[23.976, false, 24000, 1001],
		[59.94, false, 60000, 1001],
	])("%s fps (drop %s) is %i/%i", (fps, drop, num, den) => {
		const rate = parseFrameRate(fps, drop);
		expect(rate.fpsNumerator).toBe(num);
		expect(rate.fpsDenominator).toBe(den);
	});
});

describe("timing", () => {
	it("counts absolute frames from the project's start time", () => {
		const timing = timingOf(project());
		expect(timing.startFrame).toBe(90000);
		expect(timing.frameAt(0)).toBe(90000);
		expect(timing.frameAt(2)).toBe(90050);
		expect(timing.secondsAt(90050)).toBe(2);
	});

	it("round-trips frames at 29.97", () => {
		const timing = timingOf(project({ frameRate: 29.97, offset: 0 }));
		for (const frame of [0, 1, 1799, 107892]) {
			expect(timing.frameAt(timing.secondsAt(frame))).toBe(frame);
		}
	});
});

describe("markers", () => {
	const timing = timingOf(project());

	it("reads a region as a range and a marker without colour as the default", () => {
		const marker = toNleMarker(
			{
				guid: "{A}",
				isRegion: true,
				start: 2,
				end: 4,
				name: "Too loud",
				number: 1,
				color: null,
				description: "from here",
				customData: '{"x":1}',
			},
			timing,
		);
		expect(marker).toEqual({
			nleId: "{A}",
			title: "Too loud",
			description: "from here",
			frame: 90050,
			duration: 50,
			color: DEFAULT_MARKER_COLOR,
			customData: '{"x":1}',
		});
	});

	it("updates markers still in the project, adds the others", () => {
		const base = { title: "t", description: "d", customData: null, frame: 90050, color: "#00FF00" };
		const existing = new Set(["{A}"]);
		expect(toBridgeMarker({ ...base, nleId: "{A}" }, timing, existing)).toMatchObject({
			guid: "{A}",
		});
		expect(toBridgeMarker({ ...base, nleId: "{gone}" }, timing, existing)).not.toHaveProperty(
			"guid",
		);
		expect(toBridgeMarker({ ...base, nleId: null }, timing, existing)).toEqual({
			name: "t",
			description: "d",
			customData: null,
			start: 2,
			color: "#00ff00",
		});
	});

	it("sends a length only when there is one, and the default colour as none", () => {
		const marker = {
			nleId: null,
			title: "t",
			description: "",
			customData: null,
			frame: 90000,
			color: DEFAULT_MARKER_COLOR,
		};
		expect(toBridgeMarker({ ...marker, duration: 50 }, timing, new Set())).toMatchObject({
			start: 0,
			end: 2,
		});
		const point = toBridgeMarker({ ...marker, duration: 0 }, timing, new Set());
		expect(point.end).toBe(point.start);
		expect(point).not.toHaveProperty("color");
		expect(toBridgeMarker(marker, timing, new Set())).not.toHaveProperty("end");
	});
});

describe("videoRenderFormat", () => {
	it("is the FFmpeg sink with H.264/AAC MP4 at 1080p and the project's rate", () => {
		const config = Buffer.from(videoRenderFormat(25), "base64");
		expect(config.toString("latin1", 0, 4)).toBe("PMFF");
		expect(config).toHaveLength(46);
		expect(config.readInt32LE(24)).toBe(1920);
		expect(config.readInt32LE(28)).toBe(1080);
		expect(config.readFloatLE(32)).toBe(25);
	});
});

describe("buildSnapshot", () => {
	it("makes tracks with video items video tracks, first, and media from the files", () => {
		const item = {
			name: "take",
			length: 2,
			sourceOffset: 1,
			rate: 1,
			color: null,
		};
		const snapshot = buildSnapshot({
			project: project(),
			tracks: [
				{
					guid: "{T1}",
					name: "Music",
					hasVideo: false,
					items: [{ ...item, guid: "{I1}", start: 0, file: "/a/music.wav", sourceType: "WAVE" }],
				},
				{
					guid: "{T2}",
					name: "Picture",
					hasVideo: true,
					items: [
						{
							...item,
							guid: "{I2}",
							start: 1,
							file: "/a/cut.mp4",
							sourceType: "VIDEO",
							color: "#112233",
						},
					],
				},
			],
		});
		expect(snapshot.tracks.map((t) => [t.name, t.type])).toEqual([
			["Picture", "video"],
			["Music", "audio"],
		]);
		expect(snapshot.tracks[0].clips[0]).toMatchObject({
			id: "{I2}",
			mediaId: "/a/cut.mp4",
			startFrameIndex: 90025,
			durationFrameCount: 50,
			sourceStartFrameIndex: 25,
			color: { hex: "#112233" },
		});
		expect(snapshot.mediaItems.map((m) => [m.name, m.type])).toEqual([
			["music.wav", "audio"],
			["cut.mp4", "video"],
		]);
		expect(snapshot.name).toBe("Mix");
		expect(snapshot.startFrameIndex).toBe(90000);
		expect(snapshot.durationFrameCount).toBe(75);
	});
});
