import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseTimecode } from "@postpin-io/shared/logic/timecode";
import { readQuickTimeTimecode } from "#lib/upload/quicktime-timecode.ts";

// Made with ffmpeg -f lavfi -i testsrc=s=64x36 …, see inspect-file.test.ts
const fixture = (name: string) =>
	new File([readFileSync(new URL(`../../../fixtures/upload/${name}`, import.meta.url))], name);

describe("readQuickTimeTimecode", () => {
	it.each([
		// moov at the start (faststart)
		["h264-23976-tc.mp4", "01:00:00:00", 24000, 1001, false],
		// moov at the end
		["hevc-50-tc.mov", "10:00:00:00", 50, 1, false],
		["prores-2997df-tc.mov", "00:59:58;00", 30000, 1001, true],
	])("%s starts at %s", async (name, timecode, fpsNumerator, fpsDenominator, dropFrame) => {
		const tc = await readQuickTimeTimecode(fixture(name));
		expect(tc).toEqual({
			frame: expect.any(Number),
			fpsNumerator,
			fpsDenominator,
			dropFrame,
			timecode,
		});
		// the same start frames our parseTimecode computes
		expect(tc!.frame).toBe(parseTimecode(timecode, { fpsNumerator, fpsDenominator, dropFrame }));
	});

	it("the start frames match the ones of the spike: 86400, 1800000, 107832", async () => {
		const frames = await Promise.all(
			["h264-23976-tc.mp4", "hevc-50-tc.mov", "prores-2997df-tc.mov"].map(
				async (name) => (await readQuickTimeTimecode(fixture(name)))!.frame,
			),
		);
		expect(frames).toEqual([86400, 1800000, 107832]);
	});

	it.each(["h264-25.mp4", "vp9-24.webm", "mpeg2-25-tc.mxf"])(
		"null for %s, which has no QuickTime timecode",
		async (name) => {
			expect(await readQuickTimeTimecode(fixture(name))).toBeNull();
		},
	);

	it("null for an empty or truncated file", async () => {
		expect(await readQuickTimeTimecode(new File([], "empty.mov"))).toBeNull();
		const full = readFileSync(new URL("../../../fixtures/upload/hevc-50-tc.mov", import.meta.url));
		expect(await readQuickTimeTimecode(new File([full.subarray(0, 2000)], "cut.mov"))).toBeNull();
	});

	it("only reads small slices of the file, not the whole video", async () => {
		const file = fixture("prores-2997df-tc.mov");
		const slice = vi.spyOn(file, "slice");
		await readQuickTimeTimecode(file);
		const read = slice.mock.results.reduce((sum, r) => sum + (r.value as Blob).size, 0);
		// the mdat with the ProRes frames is skipped
		expect(read).toBeLessThan(file.size / 2);
	});
});
