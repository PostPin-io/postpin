import { describe, expect, it, vi } from "vitest";
import { ffprobeArgs, parseProbe, PROGRESS_ARGS, progressReader } from "../../src/media/probe.ts";

const probeJson = (streams: object[], format: object = { duration: "10.5" }) =>
	JSON.stringify({ streams, format });

describe("parseProbe", () => {
	it("reads size, rotation, audio and duration", () => {
		const json = probeJson([
			{
				codec_type: "video",
				width: 1080,
				height: 1920,
				side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
			},
			{ codec_type: "audio" },
		]);
		expect(parseProbe(json)).toEqual({
			width: 1080,
			height: 1920,
			rotation: -90,
			hasAudio: true,
			duration: 10.5,
		});
	});

	it("no rotation, no audio, and a duration ffprobe doesn't know", () => {
		const json = probeJson([{ codec_type: "video", width: 1920, height: 1080 }], {
			duration: "N/A",
		});
		expect(parseProbe(json)).toEqual({
			width: 1920,
			height: 1080,
			rotation: null,
			hasAudio: false,
			duration: null,
		});
	});

	it("throws without a video stream", () => {
		expect(() => parseProbe(probeJson([{ codec_type: "audio" }]))).toThrow("no video stream");
	});

	it("asks ffprobe for streams and format as JSON", () => {
		expect(ffprobeArgs("in.mov")).toEqual([
			"-v",
			"error",
			"-show_streams",
			"-show_format",
			"-of",
			"json",
			"in.mov",
		]);
	});
});

describe("progressReader", () => {
	it("turns out_time_us lines into fractions, also across chunks", () => {
		const onFraction = vi.fn();
		const read = progressReader(10, onFraction);
		read("frame=1\nout_time_us=2500");
		read("000\nprogress=continue\nout_time_us=10000000\n");
		read("out_time_us=12000000\n");
		expect(onFraction.mock.calls.map(([f]) => f)).toEqual([0.25, 1, 1]);
	});

	it("reports nothing without a duration", () => {
		const onFraction = vi.fn();
		progressReader(null, onFraction)("out_time_us=1000000\n");
		expect(onFraction).not.toHaveBeenCalled();
	});

	it("ffmpeg writes progress to stdout and keeps stderr for errors", () => {
		expect(PROGRESS_ARGS).toEqual(["-progress", "pipe:1", "-nostats", "-v", "error"]);
	});
});
