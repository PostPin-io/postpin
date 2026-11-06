import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { fakeJob } from "../helpers.ts";
import { prisma, resetMocks, uploads } from "./mocks.ts";

const hlsLib = vi.hoisted(() => ({ encodeHls: vi.fn() }));
vi.mock("../../src/lib/hls.ts", () => hlsLib);
vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("@aws-sdk/lib-storage", async () => (await import("./mocks.ts")).libStorage);

import { transcode } from "../../src/handlers/transcode.ts";

const data = {
	mediaId: "m1",
	video: { codec: "h264", bitRate: 1_000_000, width: 854, height: 480 },
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

type Sink = (body: Readable) => Promise<unknown>;
type OnProgress = (fraction: number) => void;

beforeEach(() => {
	resetMocks();
	prisma.mediaFile.upsert.mockResolvedValue({ id: "proxy-1" });
	hlsLib.encodeHls
		.mockReset()
		.mockImplementation(async (_input: string, _r: unknown, sink: Sink) => {
			await sink(Readable.from([Buffer.from("fmp4")]));
			return { hls, bytes: 210, codecs: "avc1.64002a,mp4a.40.2", hasAudio: true };
		});
});
afterEach(() => vi.useRealTimers());

describe("transcode", () => {
	it("upserts the proxy record by its rendition and marks it processing", async () => {
		await transcode(fakeJob("transcode", data) as never);
		expect(prisma.mediaFile.upsert).toHaveBeenCalledWith({
			where: {
				proxyOfId_width_height_bitrate: {
					proxyOfId: "m1",
					width: 854,
					height: 480,
					bitrate: 1_000_000,
				},
			},
			update: { status: "PROCESSING" },
			create: {
				proxyOfId: "m1",
				contentType: "video/mp4",
				bitrate: 1_000_000,
				videoCodec: "h264",
				width: 854,
				height: 480,
				audioCodec: "aac",
				status: "PROCESSING",
			},
		});
	});

	it("encodes the original with the job's rendition and uploads it to the proxy key", async () => {
		await transcode(fakeJob("transcode", data) as never);
		expect(hlsLib.encodeHls).toHaveBeenCalledWith(
			"https://s3/m1/original",
			{ width: 854, height: 480, videoBitRate: 1_000_000, audioBitRate: 128_000 },
			expect.any(Function),
			expect.any(Function),
		);
		expect(uploads).toHaveLength(1);
		expect(uploads[0]!.params).toMatchObject({
			Bucket: "bucket",
			Key: "m1/proxy-proxy-1",
			ContentType: "video/mp4",
		});
		expect(uploads[0]!.body).toEqual(Buffer.from("fmp4"));
	});

	it("completes the proxy with the playlist, total duration and size, and returns its id", async () => {
		const job = fakeJob("transcode", data);
		await expect(transcode(job as never)).resolves.toEqual({ proxyId: "proxy-1" });
		expect(prisma.mediaFile.update).toHaveBeenCalledWith({
			where: { id: "proxy-1" },
			data: {
				status: "COMPLETED",
				hls,
				codecs: "avc1.64002a,mp4a.40.2",
				size: 210n,
				duration: 4.5,
				audioCodec: "aac",
			},
		});
		expect(job.updateProgress).toHaveBeenLastCalledWith(1);
	});

	it("stores no audio codec when the source has no audio", async () => {
		hlsLib.encodeHls.mockResolvedValue({ hls, bytes: 1, codecs: "avc1.64002a", hasAudio: false });
		await transcode(fakeJob("transcode", data) as never);
		expect(prisma.mediaFile.update.mock.calls[0]![0].data.audioCodec).toBeNull();
	});

	it("forwards progress at most once a second", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
		hlsLib.encodeHls.mockImplementation(
			async (_i: string, _r: unknown, _s: Sink, onProgress: OnProgress) => {
				onProgress(0.1);
				vi.setSystemTime(10_500);
				onProgress(0.2); // dropped
				vi.setSystemTime(11_000);
				onProgress(0.3);
				vi.setSystemTime(11_999);
				onProgress(0.4); // dropped
				vi.setSystemTime(12_000);
				onProgress(0.5);
				return { hls, bytes: 1, codecs: "", hasAudio: true };
			},
		);
		const job = fakeJob("transcode", data);
		await transcode(job as never);
		expect(job.updateProgress.mock.calls.map(([p]) => p)).toEqual([0.1, 0.3, 0.5, 1]);
	});

	it("does not fail the job when a progress update fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		hlsLib.encodeHls.mockImplementation(
			async (_i: string, _r: unknown, _s: Sink, onProgress: OnProgress) => {
				onProgress(0.5);
				return { hls, bytes: 1, codecs: "", hasAudio: true };
			},
		);
		const job = fakeJob("transcode", data);
		job.updateProgress.mockRejectedValueOnce(new Error("redis gone"));
		await expect(transcode(job as never)).resolves.toEqual({ proxyId: "proxy-1" });
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
	});

	it("leaves the proxy unfinished when encoding fails", async () => {
		hlsLib.encodeHls.mockRejectedValue(new Error("ffmpeg exited with code 1"));
		await expect(transcode(fakeJob("transcode", data) as never)).rejects.toThrow("ffmpeg exited");
		expect(prisma.mediaFile.update).not.toHaveBeenCalled();
	});
});
