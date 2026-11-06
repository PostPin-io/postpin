import { describe, expect, it } from "vitest";
import type { FrameRate } from "../../src/types/TimelineSnapshot.ts";
import {
	INVALID_TIMECODE,
	formatTimecode,
	frameAtSeconds,
	framesPerDay,
	isTimecodeFrame,
	parseTimecode,
	secondsAtFrame,
	type FrameTiming,
} from "../../src/logic/timecode.ts";

const rate = (fpsNumerator: number, fpsDenominator = 1, dropFrame = false): FrameRate => ({
	fpsNumerator,
	fpsDenominator,
	dropFrame,
});

const FPS_24 = rate(24);
const FPS_25 = rate(25);
const FPS_30 = rate(30);
const FPS_23_976 = rate(24000, 1001);
const FPS_29_97_NDF = rate(30000, 1001);
const FPS_29_97_DF = rate(30000, 1001, true);
const FPS_59_94_DF = rate(60000, 1001, true);
const FPS_59_94_NDF = rate(60000, 1001);

const timing = (frameRate: FrameRate, startFrameIndex = 0): FrameTiming => ({
	frameRate,
	startFrameIndex,
});

describe("formatTimecode", () => {
	it.each([
		[0, FPS_24, "00:00:00:00"],
		[23, FPS_24, "00:00:00:23"],
		[24, FPS_24, "00:00:01:00"],
		[24 * 60, FPS_24, "00:01:00:00"],
		[86400, FPS_24, "01:00:00:00"],
		[86400 + 24 * 61 + 5, FPS_24, "01:01:01:05"],
		[90000, FPS_25, "01:00:00:00"],
		[24, FPS_25, "00:00:00:24"],
		[108000, FPS_30, "01:00:00:00"],
	])("formats frame %i at an integer rate", (frame, frameRate, expected) => {
		expect(formatTimecode(frame, frameRate)).toBe(expected);
	});

	it("counts fractional non-drop-frame rates at their nominal rate", () => {
		// 23.976 counts 24 frame numbers per timecode second
		expect(formatTimecode(24, FPS_23_976)).toBe("00:00:01:00");
		expect(formatTimecode(86400, FPS_23_976)).toBe("01:00:00:00");
		// 29.97 NDF counts 30, 59.94 NDF counts 60
		expect(formatTimecode(108000, FPS_29_97_NDF)).toBe("01:00:00:00");
		expect(formatTimecode(59, FPS_59_94_NDF)).toBe("00:00:00:59");
		expect(formatTimecode(60, FPS_59_94_NDF)).toBe("00:00:01:00");
	});

	it("uses ':' before the frames for non-drop-frame and ';' for drop-frame", () => {
		expect(formatTimecode(0, FPS_29_97_NDF)).toBe("00:00:00:00");
		expect(formatTimecode(0, FPS_29_97_DF)).toBe("00:00:00;00");
	});

	describe("29.97 drop-frame", () => {
		it.each([
			[1799, "00:00:59;29"],
			// frame numbers 00 and 01 are skipped at the start of minute 1
			[1800, "00:01:00;02"],
			[1801, "00:01:00;03"],
			// minute 2 starts 2 * 1798 frames + 2 later
			[3597, "00:01:59;29"],
			[3598, "00:02:00;02"],
			[17981, "00:09:59;29"],
			// every tenth minute keeps its frame numbers
			[17982, "00:10:00;00"],
			[17983, "00:10:00;01"],
			[17982 + 1800, "00:11:00;02"],
			// one hour of 29.97 DF is exactly 107892 frames
			[107892, "01:00:00;00"],
		])("formats frame %i as %s", (frame, expected) => {
			expect(formatTimecode(frame, FPS_29_97_DF)).toBe(expected);
		});
	});

	describe("59.94 drop-frame", () => {
		it.each([
			[3599, "00:00:59;59"],
			// frame numbers 00 to 03 are skipped
			[3600, "00:01:00;04"],
			[35964, "00:10:00;00"],
			[215784, "01:00:00;00"],
		])("formats frame %i as %s", (frame, expected) => {
			expect(formatTimecode(frame, FPS_59_94_DF)).toBe(expected);
		});
	});

	it("formats the last frame of the day normally", () => {
		expect(formatTimecode(framesPerDay(FPS_24) - 1, FPS_24)).toBe("23:59:59:23");
		expect(formatTimecode(framesPerDay(FPS_29_97_DF) - 1, FPS_29_97_DF)).toBe("23:59:59;29");
		expect(formatTimecode(framesPerDay(FPS_59_94_DF) - 1, FPS_59_94_DF)).toBe("23:59:59;59");
	});

	it.each([
		["24 hours", framesPerDay(FPS_24)],
		["more than 24 hours", framesPerDay(FPS_24) + 1000],
		["a negative frame", -1],
		["a fractional frame", 1.5],
		["NaN", Number.NaN],
	])("shows a placeholder for %s instead of a broken timecode", (_, frame) => {
		expect(formatTimecode(frame, FPS_24)).toBe(INVALID_TIMECODE);
	});

	it("a drop-frame day is shorter than a non-drop-frame day at the same nominal rate", () => {
		expect(formatTimecode(framesPerDay(FPS_29_97_DF), FPS_29_97_DF)).toBe(INVALID_TIMECODE);
		expect(formatTimecode(framesPerDay(FPS_29_97_DF), FPS_29_97_NDF)).not.toBe(INVALID_TIMECODE);
	});
});

describe("framesPerDay", () => {
	it.each([
		["24", FPS_24, 2_073_600],
		["25", FPS_25, 2_160_000],
		["23.976 (nominal 24)", FPS_23_976, 2_073_600],
		["29.97 NDF (nominal 30)", FPS_29_97_NDF, 2_592_000],
		["29.97 DF", FPS_29_97_DF, 2_589_408],
		["59.94 DF", FPS_59_94_DF, 5_178_816],
	])("%s fps → %i frames", (_, frameRate, expected) => {
		expect(framesPerDay(frameRate)).toBe(expected);
	});

	it("every formatted frame of the day parses back to itself (round trip at the edges)", () => {
		for (const frameRate of [FPS_24, FPS_25, FPS_29_97_DF, FPS_59_94_DF]) {
			for (const frame of [0, 1, framesPerDay(frameRate) - 1]) {
				expect(parseTimecode(formatTimecode(frame, frameRate), frameRate)).toBe(frame);
			}
		}
	});
});

describe("isTimecodeFrame", () => {
	it("accepts whole frames from 0 up to the end of the day", () => {
		expect(isTimecodeFrame(0, FPS_24)).toBe(true);
		expect(isTimecodeFrame(framesPerDay(FPS_24) - 1, FPS_24)).toBe(true);
	});

	it("rejects negative, fractional and 24 h+ frames", () => {
		expect(isTimecodeFrame(-1, FPS_24)).toBe(false);
		expect(isTimecodeFrame(0.5, FPS_24)).toBe(false);
		expect(isTimecodeFrame(framesPerDay(FPS_24), FPS_24)).toBe(false);
	});
});

describe("parseTimecode", () => {
	it.each([
		["00:00:00:00", FPS_24, 0],
		["01:00:00:00", FPS_24, 86400],
		["01:01:01:05", FPS_24, 86400 + 24 * 61 + 5],
		["01:00:00:00", FPS_25, 90000],
		["01:00:00:00", FPS_23_976, 86400],
		["01:00:00;00", FPS_29_97_DF, 107892],
		["00:01:00;02", FPS_29_97_DF, 1800],
		["00:10:00;00", FPS_29_97_DF, 17982],
		["00:01:00;04", FPS_59_94_DF, 3600],
	])("parses %s", (timecode, frameRate, expected) => {
		expect(parseTimecode(timecode, frameRate)).toBe(expected);
	});

	it("accepts either separator regardless of the frame rate", () => {
		expect(parseTimecode("00:01:00;02", FPS_29_97_DF)).toBe(1800);
		expect(parseTimecode("00:01:00:02", FPS_29_97_DF)).toBe(1800);
		expect(parseTimecode("01;00;00;00", FPS_24)).toBe(86400);
	});

	it("treats digits without separators as right-aligned, like NLE timecode entry", () => {
		expect(parseTimecode("1", FPS_24)).toBe(1);
		expect(parseTimecode("100", FPS_24)).toBe(24);
		expect(parseTimecode("1000000", FPS_24)).toBe(86400);
		expect(parseTimecode("01000000", FPS_24)).toBe(86400);
	});

	it.each([
		["", "empty"],
		["abc", "letters"],
		["-1", "a negative sign"],
		["00:00:00.00", "a dot separator"],
		["000000000", "more than 8 digits"],
		["00:60:00:00", "minutes over 59"],
		["00:00:60:00", "seconds over 59"],
	])("rejects %j (%s)", (timecode) => {
		expect(() => parseTimecode(timecode, FPS_24)).toThrow(/Invalid timecode/);
	});

	it("rejects a frame number at or above the nominal rate", () => {
		expect(() => parseTimecode("00:00:00:24", FPS_24)).toThrow(/Invalid timecode/);
		expect(parseTimecode("00:00:00:24", FPS_25)).toBe(24);
		expect(() => parseTimecode("00:00:00:30", FPS_29_97_DF)).toThrow(/Invalid timecode/);
		expect(parseTimecode("00:00:00:59", FPS_59_94_DF)).toBe(59);
	});

	it("rejects frame numbers that drop-frame skips", () => {
		expect(() => parseTimecode("00:01:00;00", FPS_29_97_DF)).toThrow(/Invalid timecode/);
		expect(() => parseTimecode("00:01:00;01", FPS_29_97_DF)).toThrow(/Invalid timecode/);
		expect(() => parseTimecode("00:01:00;02", FPS_59_94_DF)).toThrow(/Invalid timecode/);
		// the same frame numbers are fine in a tenth minute
		expect(parseTimecode("00:10:00;00", FPS_29_97_DF)).toBe(17982);
	});

	it("rejects 24 hours and more with our own error, not the library's", () => {
		expect(() => parseTimecode("24:00:00:00", FPS_24)).toThrow("Invalid timecode: 24:00:00:00");
		expect(() => parseTimecode("99:00:00:00", FPS_24)).toThrow("Invalid timecode: 99:00:00:00");
		expect(parseTimecode("23:59:59:23", FPS_24)).toBe(framesPerDay(FPS_24) - 1);
	});

	it.each([
		["29.97 DF", FPS_29_97_DF],
		["59.94 DF", FPS_59_94_DF],
		["23.976", FPS_23_976],
		["25", FPS_25],
	])(
		"round-trips formatTimecode for every 7th frame over the first hours at %s",
		(_, frameRate) => {
			for (let frame = 0; frame < 250_000; frame += 7) {
				expect(parseTimecode(formatTimecode(frame, frameRate), frameRate)).toBe(frame);
			}
		},
	);
});

describe("secondsAtFrame", () => {
	it("returns the middle of the frame, relative to the timeline start", () => {
		expect(secondsAtFrame(0, timing(FPS_25))).toBeCloseTo(0.02, 10);
		expect(secondsAtFrame(25, timing(FPS_25))).toBeCloseTo(1.02, 10);
		expect(secondsAtFrame(86400, timing(FPS_24, 86400))).toBeCloseTo(1 / 48, 10);
		expect(secondsAtFrame(86424, timing(FPS_24, 86400))).toBeCloseTo(1 + 1 / 48, 10);
	});

	it("uses the real rate for fractional frame rates", () => {
		expect(secondsAtFrame(24000, timing(FPS_23_976))).toBeCloseTo(
			(24000 + 0.5) / (24000 / 1001),
			9,
		);
	});

	it("goes negative for frames before the timeline start", () => {
		expect(secondsAtFrame(0, timing(FPS_24, 24))).toBeLessThan(0);
	});
});

describe("frameAtSeconds", () => {
	it("returns the absolute frame shown at a media time", () => {
		expect(frameAtSeconds(0, timing(FPS_24, 86400))).toBe(86400);
		expect(frameAtSeconds(1, timing(FPS_24, 86400))).toBe(86424);
		expect(frameAtSeconds(1 / 24 - 0.001, timing(FPS_24))).toBe(0);
	});

	it("is the inverse of secondsAtFrame", () => {
		for (const frameRate of [FPS_24, FPS_23_976, FPS_29_97_DF, FPS_59_94_DF]) {
			const t = timing(frameRate, 86400);
			for (let frame = 86400; frame < 86400 + 5000; frame++) {
				expect(frameAtSeconds(secondsAtFrame(frame, t), t)).toBe(frame);
			}
		}
	});

	it.each([
		["23.976", FPS_23_976],
		["29.97", FPS_29_97_NDF],
		["59.94", FPS_59_94_DF],
		["24", FPS_24],
	])(
		"maps frame starts rounded to whole microseconds (as Chrome reports them) to that frame at %s",
		(_, frameRate) => {
			const fps = frameRate.fpsNumerator / frameRate.fpsDenominator;
			for (let frame = 0; frame < 50_000; frame++) {
				const seconds = Math.round((frame / fps) * 1e6) / 1e6;
				expect(frameAtSeconds(seconds, timing(frameRate))).toBe(frame);
			}
		},
	);
});
