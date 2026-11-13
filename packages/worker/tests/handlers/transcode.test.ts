import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, uploads } from "./mocks.ts";

const hlsLib = vi.hoisted(() => ({ encodeHls: vi.fn() }));
vi.mock("../../src/lib/hls.ts", () => hlsLib);
vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("@aws-sdk/lib-storage", async () => (await import("./mocks.ts")).libStorage);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);

import { transcode } from "../../src/handlers/transcode.ts";

const data = {
	mediaId: "m1",
	renditions: [
		{ codec: "h264", bitRate: 3_500_000, width: 1280, height: 720 },
		{ codec: "h264", bitRate: 1_000_000, width: 854, height: 480 },
	],
	audio: { codec: "aac", bitRate: 128_000 },
};
const hls = {
	init: { offset: 0, length: 100 },
	segments: [
		{ duration: 2, offset: 100, length: 50 },
		{ duration: 2, offset: 150, length: 50 },
		{ duration: 0.5, offset: 200, length: 10 },
	],
};
const result = (bytes: number, hasAudio = true) => ({
	hls,
	bytes,
	codecs: hasAudio ? "avc1.64002a,mp4a.40.2" : "avc1.64002a",
	hasAudio,
});

type Sink = (index: number, body: Readable) => Promise<unknown>;
type OnProgress = (fraction: number) => void;

/** What ffprobe reports for the original */
function original(
	{ width = 1920, height = 1080, rotation, audio = true } = {} as {
		width?: number;
		height?: number;
		rotation?: number;
		audio?: boolean;
	},
) {
	ffmpegLib.ffprobe.mockResolvedValue({
		streams: [
			{
				codec_type: "video",
				width,
				height,
				...(rotation !== undefined ? { side_data_list: [{ rotation }] } : {}),
			},
			...(audio ? [{ codec_type: "audio" }] : []),
		],
	});
}

beforeEach(() => {
	resetMocks();
	original();
	// proxy-720 and proxy-480, in rendition order
	prisma.mediaFile.upsert.mockImplementation(
		async ({ where }: { where: { proxyOfId_width_height_bitrate: { height: number } } }) => ({
			id: `proxy-${where.proxyOfId_width_height_bitrate.height}`,
		}),
	);
	hlsLib.encodeHls.mockReset().mockImplementation(async (_options: unknown, sink: Sink) => {
		await Promise.all([
			sink(0, Readable.from([Buffer.from("fmp4-720")])),
			sink(1, Readable.from([Buffer.from("fmp4-480")])),
		]);
		return [result(720), result(480)];
	});
});
afterEach(() => vi.useRealTimers());

describe("transcode", () => {
	it("upserts a proxy record per rendition and marks them processing in one transaction", async () => {
		await transcode(fakeJob("transcode", data) as never);
		expect(prisma.$transaction).toHaveBeenCalledTimes(2);
		expect(prisma.mediaFile.upsert.mock.calls.map(([arg]) => arg)).toEqual(
			data.renditions.map(({ width, height, bitRate }) => ({
				where: {
					proxyOfId_width_height_bitrate: { proxyOfId: "m1", width, height, bitrate: bitRate },
				},
				update: { status: "PROCESSING" },
				create: {
					proxyOfId: "m1",
					contentType: "video/mp4",
					bitrate: bitRate,
					videoCodec: "h264",
					width,
					height,
					audioCodec: "aac",
					status: "PROCESSING",
				},
			})),
		);
	});

	it("encodes all renditions at once and uploads each to its proxy key", async () => {
		await transcode(fakeJob("transcode", data) as never);
		expect(hlsLib.encodeHls).toHaveBeenCalledTimes(1);
		expect(ffmpegLib.ffprobe).toHaveBeenCalledWith("https://s3/m1/original");
		expect(hlsLib.encodeHls).toHaveBeenCalledWith(
			{
				input: "https://s3/m1/original",
				renditions: data.renditions,
				hasAudio: true,
				audioBitRate: 128_000,
			},
			expect.any(Function),
			expect.any(Function),
		);
		expect(
			uploads.map(({ params, body }) => [params.Bucket, params.Key, params.ContentType, `${body}`]),
		).toEqual([
			["bucket", "m1/proxy-proxy-720", "video/mp4", "fmp4-720"],
			["bucket", "m1/proxy-proxy-480", "video/mp4", "fmp4-480"],
		]);
	});

	it("completes every proxy with its playlist, duration and size, and returns the smallest", async () => {
		const job = fakeJob("transcode", data);
		await expect(transcode(job as never)).resolves.toEqual({ proxyId: "proxy-480" });
		expect(prisma.mediaFile.update.mock.calls.map(([arg]) => arg)).toEqual(
			[
				["proxy-720", 720n],
				["proxy-480", 480n],
			].map(([id, size]) => ({
				where: { id },
				data: {
					status: "COMPLETED",
					hls,
					codecs: "avc1.64002a,mp4a.40.2",
					size,
					duration: 4.5,
					audioCodec: "aac",
				},
			})),
		);
		expect(job.updateProgress).toHaveBeenLastCalledWith(1);
	});

	it("skips renditions larger than the original", async () => {
		original({ width: 1000, height: 562 });
		hlsLib.encodeHls.mockResolvedValue([result(480)]);
		await expect(transcode(fakeJob("transcode", data) as never)).resolves.toEqual({
			proxyId: "proxy-480",
		});
		expect(prisma.mediaFile.upsert).toHaveBeenCalledTimes(1);
		expect(hlsLib.encodeHls.mock.calls[0]![0].renditions).toEqual([data.renditions[1]]);
		expect(prisma.mediaFile.update.mock.calls.map(([arg]) => arg.where.id)).toEqual(["proxy-480"]);
	});

	it("compares the size the player shows, after rotation", async () => {
		// stored as 562x1000, which fits the 720p box at 405x720; shown rotated as 1000x562 it doesn't
		original({ width: 562, height: 1000, rotation: -90 });
		hlsLib.encodeHls.mockResolvedValue([result(480)]);
		await transcode(fakeJob("transcode", data) as never);
		expect(hlsLib.encodeHls.mock.calls[0]![0].renditions).toEqual([data.renditions[1]]);
	});

	it("fails for an original without video, before creating proxies", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({ streams: [{ codec_type: "audio" }] });
		await expect(transcode(fakeJob("transcode", data) as never)).rejects.toThrow("no video stream");
		expect(prisma.mediaFile.upsert).not.toHaveBeenCalled();
		expect(hlsLib.encodeHls).not.toHaveBeenCalled();
	});

	it("stores no audio codec when the source has no audio", async () => {
		original({ audio: false });
		hlsLib.encodeHls.mockResolvedValue([result(1, false), result(1, false)]);
		await transcode(fakeJob("transcode", data) as never);
		expect(hlsLib.encodeHls.mock.calls[0]![0].hasAudio).toBe(false);
		expect(prisma.mediaFile.update.mock.calls.map(([arg]) => arg.data.audioCodec)).toEqual([
			null,
			null,
		]);
	});

	it("rejects a job without renditions before touching anything", async () => {
		await expect(
			transcode(fakeJob("transcode", { ...data, renditions: [] }) as never),
		).rejects.toThrow("at least one rendition");
		expect(prisma.mediaFile.upsert).not.toHaveBeenCalled();
		expect(hlsLib.encodeHls).not.toHaveBeenCalled();
	});

	it("forwards progress at most once a second", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
		hlsLib.encodeHls.mockImplementation(async (_o: unknown, _s: Sink, onProgress: OnProgress) => {
			onProgress(0.1);
			vi.setSystemTime(10_500);
			onProgress(0.2); // dropped
			vi.setSystemTime(11_000);
			onProgress(0.3);
			vi.setSystemTime(11_999);
			onProgress(0.4); // dropped
			vi.setSystemTime(12_000);
			onProgress(0.5);
			return [result(1), result(1)];
		});
		const job = fakeJob("transcode", data);
		await transcode(job as never);
		expect(job.updateProgress.mock.calls.map(([p]) => p)).toEqual([0.1, 0.3, 0.5, 1]);
	});

	it("does not fail the job when a progress update fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		hlsLib.encodeHls.mockImplementation(async (_o: unknown, _s: Sink, onProgress: OnProgress) => {
			onProgress(0.5);
			return [result(1), result(1)];
		});
		const job = fakeJob("transcode", data);
		job.updateProgress.mockRejectedValueOnce(new Error("redis gone"));
		await expect(transcode(job as never)).resolves.toEqual({ proxyId: "proxy-480" });
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
	});

	it("leaves the proxies unfinished when encoding fails", async () => {
		hlsLib.encodeHls.mockRejectedValue(new Error("ffmpeg exited with code 1"));
		await expect(transcode(fakeJob("transcode", data) as never)).rejects.toThrow("ffmpeg exited");
		expect(prisma.mediaFile.update).not.toHaveBeenCalled();
	});
});
