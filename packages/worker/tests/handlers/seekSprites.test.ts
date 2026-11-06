import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFfmpegRun, fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, s3Client, sharedStorage } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);

import { seekSprites } from "../../src/handlers/seekSprites.ts";

const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, 0xff, 0xd9]);
const segments = (count: number) =>
	Array.from({ length: count }, (_, i) => ({ duration: 2.002, offset: i * 10, length: 10 }));
const proxy = (count: number, width = 854, height = 480) => ({
	id: "proxy-1",
	width,
	height,
	hls: { init: { offset: 0, length: 10 }, segments: segments(count) },
});
const job = () =>
	fakeJob("seekSprites", { mediaId: "m1" }, { "bull:transcode:1": { proxyId: "proxy-1" } });

beforeEach(() => {
	resetMocks();
	prisma.mediaFile.findUniqueOrThrow.mockResolvedValue(proxy(150));
	ffmpegLib.ffmpeg.mockImplementation(() => fakeFfmpegRun([Buffer.concat([jpeg(0), jpeg(1)])]));
});

describe("seekSprites", () => {
	it("needs the proxy from its transcode child", async () => {
		await expect(seekSprites(fakeJob("seekSprites", { mediaId: "m1" }) as never)).rejects.toThrow(
			"seekSprites needs its transcode child",
		);
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
	});

	it("tiles the proxy's keyframes into 10x10 sheets from a presigned proxy URL", async () => {
		await seekSprites(job() as never);
		expect(prisma.mediaFile.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "proxy-1" } });
		expect(sharedStorage.getPresignedUrl).toHaveBeenCalledWith(s3Client, expect.anything(), {
			mediaId: "m1",
			type: "proxy",
			proxyId: "proxy-1",
		});
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args.slice(0, 5)).toEqual([
			"-nostdin",
			"-skip_frame",
			"nokey",
			"-i",
			"https://s3/m1/proxy-proxy-1",
		]);
		// 854x480 -> 160x89.9, rounded to an even 90
		expect(args[args.indexOf("-vf") + 1]).toBe(
			"scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=10x10",
		);
	});

	it("uploads one JPEG per sheet and stores the sprite layout", async () => {
		await expect(seekSprites(job() as never)).resolves.toEqual({ proxyId: "proxy-1" });
		expect(s3Client.putObject.mock.calls.map(([p]) => [p.Key, p.Body])).toEqual([
			["m1/sprite-0", jpeg(0)],
			["m1/sprite-1", jpeg(1)],
		]);
		expect(s3Client.putObject.mock.calls[0]![0]).toMatchObject({
			Bucket: "bucket",
			ContentType: "image/jpeg",
		});
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				seekSprites: {
					interval: 2.002,
					tileWidth: 160,
					tileHeight: 90,
					columns: 10,
					rows: 10,
					count: 150,
					sheets: 2,
				},
			},
		});
	});

	it("rounds the tile height to an even number for other aspect ratios", async () => {
		prisma.mediaFile.findUniqueOrThrow.mockResolvedValue(proxy(150, 640, 480));
		await seekSprites(job() as never);
		expect(prisma.media.update.mock.calls[0]![0].data.seekSprites.tileHeight).toBe(120);
	});

	it("fails when ffmpeg wrote a different number of sheets than the keyframes need", async () => {
		prisma.mediaFile.findUniqueOrThrow.mockResolvedValue(proxy(201));
		await expect(seekSprites(job() as never)).rejects.toThrow(
			"Expected sheets for 201 keyframes, ffmpeg wrote 2",
		);
		expect(prisma.media.update).not.toHaveBeenCalled();
	});

	it("fails with ffmpeg's error after uploading what it wrote", async () => {
		ffmpegLib.ffmpeg.mockImplementation(() =>
			fakeFfmpegRun([jpeg(0)], new Error("ffmpeg exited with code 1")),
		);
		await expect(seekSprites(job() as never)).rejects.toThrow("ffmpeg exited with code 1");
		expect(s3Client.putObject).toHaveBeenCalledOnce();
		expect(prisma.media.update).not.toHaveBeenCalled();
	});

	it("rejects a proxy without a valid HLS index", async () => {
		prisma.mediaFile.findUniqueOrThrow.mockResolvedValue({ ...proxy(1), hls: null });
		await expect(seekSprites(job() as never)).rejects.toThrow();
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
	});
});
