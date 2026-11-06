import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeProcess } from "../helpers.ts";

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => childProcess);

import { ProbeResult, ffmpeg, ffprobe } from "../../src/lib/ffmpeg.ts";
import * as v from "valibot";

let proc: FakeProcess;

beforeEach(() => {
	proc = new FakeProcess();
	childProcess.spawn.mockReset().mockReturnValue(proc);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const probeOutput = {
	streams: [
		{
			index: 0,
			codec_type: "video",
			codec_name: "h264",
			width: 1920,
			height: 1080,
			pix_fmt: "yuv420p",
			avg_frame_rate: "24000/1001",
			duration: "10.010000",
			bit_rate: "8000000",
			tags: { language: "und" },
		},
		{ index: 1, codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
		{ index: 2, codec_type: "data", codec_name: "tmcd", extra: "kept" },
	],
	format: { format_name: "mov,mp4", duration: "10.01", size: "1000", bit_rate: "800" },
};

describe("ProbeResult", () => {
	it("converts ffprobe's numeric strings and frame rate fractions to numbers", () => {
		const result = v.parse(ProbeResult, probeOutput);
		expect(result.streams[0]).toMatchObject({
			avg_frame_rate: 24000 / 1001,
			duration: 10.01,
			bit_rate: 8_000_000,
		});
		expect(result.streams[1]).toMatchObject({ sample_rate: 48000, channels: 2 });
		expect(result.format).toEqual({
			format_name: "mov,mp4",
			duration: 10.01,
			size: 1000,
			bit_rate: 800,
		});
	});

	it("turns a 0/0 frame rate (e.g. still images) into 0", () => {
		const output = structuredClone(probeOutput);
		output.streams[0]!.avg_frame_rate = "0/0";
		expect(v.parse(ProbeResult, output).streams[0]).toMatchObject({ avg_frame_rate: 0 });
	});

	it("keeps unknown fields of other stream types", () => {
		expect(v.parse(ProbeResult, probeOutput).streams[2]).toMatchObject({ extra: "kept" });
	});

	it("rejects unknown stream types and video streams without dimensions", () => {
		const unknownType = structuredClone(probeOutput);
		unknownType.streams[2]!.codec_type = "unknown";
		expect(v.safeParse(ProbeResult, unknownType).success).toBe(false);

		const noWidth = structuredClone(probeOutput) as { streams: Record<string, unknown>[] };
		delete noWidth.streams[0]!.width;
		expect(v.safeParse(ProbeResult, noWidth).success).toBe(false);
	});
});

describe("ffprobe", () => {
	it("runs ffprobe with JSON output and resolves the parsed result", async () => {
		const result = ffprobe("https://s3/original");
		expect(childProcess.spawn).toHaveBeenCalledWith("ffprobe", [
			"-v",
			"error",
			"-show_format",
			"-show_streams",
			"-of",
			"json",
			"https://s3/original",
		]);
		// output may arrive in several chunks
		const json = JSON.stringify(probeOutput);
		proc.stdout.emit("data", Buffer.from(json.slice(0, 20)));
		proc.stdout.emit("data", Buffer.from(json.slice(20)));
		proc.emit("close", 0);
		await expect(result).resolves.toMatchObject({ format: { format_name: "mov,mp4" } });
	});

	it("rejects on a non-zero exit code", async () => {
		const result = ffprobe("x");
		proc.writeStderr("No such file");
		proc.emit("close", 1);
		await expect(result).rejects.toThrow("ffprobe exited with code 1");
		expect(console.error).toHaveBeenCalledWith("ffprobe error: No such file");
	});

	it("rejects on output that isn't JSON or doesn't match the schema", async () => {
		const notJson = ffprobe("x");
		proc.stdout.emit("data", Buffer.from("not json"));
		proc.emit("close", 0);
		await expect(notJson).rejects.toThrow(/Failed to parse ffprobe output/);

		proc = new FakeProcess();
		childProcess.spawn.mockReturnValue(proc);
		const invalid = ffprobe("x");
		proc.stdout.emit("data", Buffer.from(JSON.stringify({ streams: [] })));
		proc.emit("close", 0);
		await expect(invalid).rejects.toThrow(/Failed to parse ffprobe output/);
	});

	it("rejects when ffprobe can't be started", async () => {
		const result = ffprobe("x");
		proc.emit("error", Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" }));
		await expect(result).rejects.toThrow(/ENOENT/);
	});
});

describe("ffmpeg", () => {
	it("spawns ffmpeg with the given args and exposes stdout", () => {
		const run = ffmpeg(["-i", "in", "pipe:1"]);
		expect(childProcess.spawn).toHaveBeenCalledWith("ffmpeg", ["-i", "in", "pipe:1"]);
		expect(run.stdout).toBe(proc.stdout);
		proc.close(0);
		return run.done;
	});

	it("resolves done on exit code 0 and rejects otherwise", async () => {
		const ok = ffmpeg([]);
		proc.close(0);
		await expect(ok.done).resolves.toBeUndefined();

		proc = new FakeProcess();
		childProcess.spawn.mockReturnValue(proc);
		const failed = ffmpeg([]);
		proc.close(234);
		await expect(failed.done).rejects.toThrow("ffmpeg exited with code 234");
	});

	it("rejects done when ffmpeg can't be started", async () => {
		const run = ffmpeg([]);
		proc.emit("error", new Error("spawn ffmpeg ENOENT"));
		await expect(run.done).rejects.toThrow("ENOENT");
	});

	it("reports progress as time over the input's duration, capped at 1", async () => {
		const onProgress = vi.fn();
		const run = ffmpeg([], onProgress);
		// no duration seen yet: no progress
		proc.writeStderr("frame=1 time=00:00:01.00 bitrate=1");
		proc.writeStderr("  Duration: 01:00:00.00, start: 0.000000, bitrate: 1000 kb/s\n");
		proc.writeStderr("frame=100 fps=50 time=00:15:00.00 bitrate=1");
		proc.writeStderr("frame=200 fps=50 time=00:30:00.50 bitrate=1");
		proc.writeStderr("frame=300 fps=50 time=01:00:05.00 bitrate=1");
		proc.close(0);
		await run.done;
		expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0.25, 1800.5 / 3600, 1]);
	});

	it("reads duration and time from the same chunk", async () => {
		const onProgress = vi.fn();
		const run = ffmpeg([], onProgress);
		proc.writeStderr("Duration: 00:00:10.00, start\nframe=1 time=00:00:05.00 bitrate");
		proc.close(0);
		await run.done;
		expect(onProgress).toHaveBeenCalledWith(0.5);
	});

	it("never reports progress without a known duration (e.g. Duration: N/A)", async () => {
		const onProgress = vi.fn();
		const run = ffmpeg([], onProgress);
		proc.writeStderr("Duration: N/A, start: 0\n");
		proc.writeStderr("time=00:00:05.00");
		proc.close(0);
		await run.done;
		expect(onProgress).not.toHaveBeenCalled();
	});
});
