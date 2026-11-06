import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFfmpegRun, fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);

import { movieBarcode } from "../../src/handlers/movieBarcode.ts";

const proxy = (count: number) => ({
	id: "proxy-1",
	hls: {
		init: { offset: 0, length: 10 },
		segments: Array.from({ length: count }, (_, i) => ({ duration: 2, offset: i, length: 1 })),
	},
});
const job = () =>
	fakeJob("movieBarcode", { mediaId: "m1" }, { "bull:seekSprites:1": { proxyId: "proxy-1" } });
const RGB = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);

beforeEach(() => {
	resetMocks();
	prisma.mediaFile.findUniqueOrThrow.mockResolvedValue(proxy(3));
	// colors may arrive split anywhere
	ffmpegLib.ffmpeg.mockImplementation(() => fakeFfmpegRun([RGB.subarray(0, 4), RGB.subarray(4)]));
});

describe("movieBarcode", () => {
	it("needs the proxy from its seekSprites child", async () => {
		await expect(movieBarcode(fakeJob("movieBarcode", { mediaId: "m1" }) as never)).rejects.toThrow(
			"movieBarcode needs its seekSprites child",
		);
	});

	it("scales each keyframe of the proxy to one rgb24 pixel", async () => {
		await movieBarcode(job() as never);
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args[args.indexOf("-i") + 1]).toBe("https://s3/m1/proxy-proxy-1");
		expect(args).toEqual(
			expect.arrayContaining(["-skip_frame", "nokey", "-pix_fmt", "rgb24", "-f", "rawvideo"]),
		);
		expect(args[args.indexOf("-vf") + 1]).toBe("scale=1:1:flags=area");
	});

	it("stores the colors as base64 with the segment interval, and passes the proxy on", async () => {
		await expect(movieBarcode(job() as never)).resolves.toEqual({ proxyId: "proxy-1" });
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { movieBarcode: { interval: 2, count: 3, colors: RGB.toString("base64") } },
		});
	});

	it("fails when the number of colors doesn't match the segments", async () => {
		prisma.mediaFile.findUniqueOrThrow.mockResolvedValue(proxy(4));
		await expect(movieBarcode(job() as never)).rejects.toThrow(
			"Expected 4 barcode colors, ffmpeg wrote 3",
		);
		expect(prisma.media.update).not.toHaveBeenCalled();
	});

	it("fails with ffmpeg's error", async () => {
		ffmpegLib.ffmpeg.mockImplementation(() =>
			fakeFfmpegRun([RGB], new Error("ffmpeg exited with code 1")),
		);
		await expect(movieBarcode(job() as never)).rejects.toThrow("ffmpeg exited with code 1");
		expect(prisma.media.update).not.toHaveBeenCalled();
	});
});
