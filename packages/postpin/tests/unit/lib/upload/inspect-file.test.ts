// Fixtures in tests/fixtures/upload, one second of ffmpeg's testsrc at 64x36:
//   h264-23976-tc.mp4     -c:v libx264 -timecode 01:00:00:00 -movflags +faststart (23.976 fps)
//   h264-25.mp4           -c:v libx264 (25 fps, no timecode)
//   hevc-50-tc.mov        -c:v libx265 -tag:v hvc1 -timecode 10:00:00:00 (50 fps)
//   prores-2997df-tc.mov  -c:v prores_ks -profile:v 0 -timecode "00:59:58;00" (29.97 fps)
//   vp9-24.webm           -c:v libvpx-vp9 (24 fps)
//   mpeg2-25-tc.mxf       -c:v mpeg2video -timecode 01:00:00:00 (25 fps)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectFile } from "#lib/upload/inspect-file.ts";

const fixture = (name: string, as = name) =>
	new File([readFileSync(new URL(`../../../fixtures/upload/${name}`, import.meta.url))], as);
const rate = (fpsNumerator: number, fpsDenominator = 1, dropFrame = false) => ({
	fpsNumerator,
	fpsDenominator,
	dropFrame,
});

describe("inspectFile", () => {
	it.each([
		["h264-23976-tc.mp4", "mp4", "H.264", rate(24000, 1001), "01:00:00:00"],
		["h264-25.mp4", "mp4", "H.264", rate(25), null],
		["hevc-50-tc.mov", "mov", "HEVC", rate(50), "10:00:00:00"],
		// drop-frame comes from the timecode track
		["prores-2997df-tc.mov", "mov", "ProRes", rate(30000, 1001, true), "00:59:58;00"],
		// mediabunny measures about 23.998 here, rounded to 24
		["vp9-24.webm", "webm", "VP9", rate(24), null],
	])(
		"%s: %s %s at %j, starting at %s",
		async (name, container, codec, frameRate, startTimecode) => {
			const result = await inspectFile(fixture(name));
			expect(result).toMatchObject({
				kind: "video",
				container,
				codec,
				width: 64,
				height: 36,
				frameRate,
				variableFrameRate: false,
				startTimecode,
			});
			if (result.kind === "video") expect(result.durationSeconds).toBeCloseTo(1, 1);
		},
	);

	it("MXF is allowed, but read after the upload", async () => {
		expect(await inspectFile(fixture("mpeg2-25-tc.mxf"))).toEqual({
			kind: "later",
			container: "mxf",
		});
	});

	it.each(["clip.avi", "notes.txt", "noextension"])("%s: unsupported file type", async (name) => {
		const result = await inspectFile(new File(["x"], name));
		expect(result).toMatchObject({
			kind: "invalid",
			message: expect.stringMatching(/Unsupported/),
		});
	});

	it("a file that only looks like a video", async () => {
		const result = await inspectFile(new File(["not a video at all"], "fake.mov"));
		expect(result).toEqual({ kind: "invalid", message: "This file can't be read. Is it a video?" });
	});

	it("a WebM file under another extension is still read as WebM", async () => {
		const result = await inspectFile(fixture("vp9-24.webm", "renamed.mp4"));
		expect(result).toMatchObject({ kind: "video", container: "webm" });
	});
});
