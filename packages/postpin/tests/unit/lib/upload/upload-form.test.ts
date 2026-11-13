import { describe, expect, it } from "vitest";
import {
	buildUploadForm,
	defaultExportName,
	formatDuration,
	initialValues,
	parseStart,
	sizeProblem,
	timecodeFor,
} from "#lib/upload/upload-form.ts";
import type { Inspection } from "#lib/upload/inspect-file.ts";

const GB = 1_000_000_000n;
const FPS_2997_DF = { fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: true };

const video = (over: Partial<Extract<Inspection, { kind: "video" }>> = {}): Inspection => ({
	kind: "video",
	container: "mov",
	codec: "ProRes",
	width: 1920,
	height: 1080,
	durationSeconds: 10,
	frameRate: { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false },
	measuredFps: 24,
	variableFrameRate: false,
	startTimecode: "01:00:00:00",
	...over,
});

describe("defaultExportName", () => {
	it.each([
		["Trailer_v3.final.mov", "Trailer_v3.final"],
		["clip.MP4", "clip"],
		[".hidden", ".hidden"],
		["noext", "noext"],
	])("%s → %s", (file, name) => expect(defaultExportName(file)).toBe(name));

	it("keeps at most 100 characters", () => {
		expect(defaultExportName(`${"x".repeat(150)}.mov`)).toHaveLength(100);
	});
});

describe("sizeProblem", () => {
	it("nothing while the limits load, or without limits", () => {
		expect(sizeProblem(10, undefined)).toBeNull();
		expect(sizeProblem(10, { maxFileSize: null, available: null })).toBeNull();
	});

	it("the file size limit", () => {
		expect(sizeProblem(Number(20n * GB), { maxFileSize: 20n * GB, available: null })).toBeNull();
		expect(sizeProblem(Number(21n * GB), { maxFileSize: 20n * GB, available: null })).toBe(
			"The file is too large: 21 GB, at most 20 GB per upload.",
		);
	});

	it("the free quota", () => {
		expect(sizeProblem(Number(2n * GB), { maxFileSize: null, available: GB })).toBe(
			"Not enough storage left: the file needs 2 GB, 1 GB are free.",
		);
		expect(sizeProblem(1, { maxFileSize: null, available: 0n })).toMatch(/storage is full/);
	});
});

describe("timecodes", () => {
	it("writes a timecode with the separator of the rate", () => {
		expect(timecodeFor("00:59:58:00", FPS_2997_DF)).toBe("00:59:58;00");
		expect(timecodeFor("01:00:00;00", { ...FPS_2997_DF, dropFrame: false })).toBe("01:00:00:00");
		expect(timecodeFor("nonsense", FPS_2997_DF)).toBe("nonsense");
	});

	it("parses the start, or says what is wrong", () => {
		expect(parseStart(" 00:59:58;00 ", FPS_2997_DF)).toEqual({ frame: 107832 });
		expect(
			parseStart("01:00:00:24", { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false }),
		).toEqual({
			error: "Use hh:mm:ss:ff, frames from 00 to 23",
		});
	});
});

describe("initialValues", () => {
	it("prefills rate and timecode from the file", () => {
		expect(initialValues(video())).toEqual({ frameRate: "24", startTimecode: "01:00:00:00" });
		expect(initialValues(video({ frameRate: FPS_2997_DF, startTimecode: null }))).toEqual({
			frameRate: "29.97 DF",
			startTimecode: "00:00:00;00",
		});
	});

	it("leaves MXF empty: read after upload", () => {
		expect(initialValues({ kind: "later", container: "mxf" })).toEqual({
			frameRate: "",
			startTimecode: "",
		});
	});
});

describe("buildUploadForm", () => {
	it("turns the form into what completeWebUpload takes", () => {
		expect(
			buildUploadForm({
				fileName: "clip.mov",
				inspection: video({ durationSeconds: 10.01 }),
				frameRateLabel: "23.976",
				startTimecode: "01:00:00:00",
				changed: ["frameRate"],
				cutLevel: "medium",
			}),
		).toEqual({
			fileName: "clip.mov",
			frameRate: { fpsNumerator: 24000, fpsDenominator: 1001, dropFrame: false },
			startFrameIndex: 86400,
			durationFrameCount: 240,
			userSet: ["frameRate"],
			cutLevel: "medium",
		});
	});

	it("MXF without values: everything null, the worker fills it in", () => {
		expect(
			buildUploadForm({
				fileName: "a.mxf",
				inspection: { kind: "later", container: "mxf" },
				frameRateLabel: "",
				startTimecode: "",
				changed: [],
				cutLevel: "none",
			}),
		).toEqual({
			fileName: "a.mxf",
			frameRate: null,
			startFrameIndex: null,
			durationFrameCount: null,
			userSet: [],
			cutLevel: "none",
		});
	});

	it("a timecode needs a rate, and a valid one", () => {
		const base = {
			fileName: "a.mxf",
			inspection: { kind: "later", container: "mxf" } as const,
			changed: [],
			cutLevel: "medium" as const,
		};
		expect(buildUploadForm({ ...base, frameRateLabel: "", startTimecode: "01:00:00:00" })).toEqual({
			error: "Choose the frame rate for the start timecode",
		});
		// typed like in an NLE: the digits fill up from the right, "1:00" is one second
		expect(buildUploadForm({ ...base, frameRateLabel: "25", startTimecode: "1:00" })).toMatchObject(
			{
				startFrameIndex: 25,
			},
		);
		expect(buildUploadForm({ ...base, frameRateLabel: "25", startTimecode: "xx" })).toHaveProperty(
			"error",
		);
	});
});

describe("formatDuration", () => {
	it.each([
		[0, "00:00"],
		[61.4, "01:01"],
		[3725, "1:02:05"],
	])("%s s → %s", (s, text) => expect(formatDuration(s)).toBe(text));
});
