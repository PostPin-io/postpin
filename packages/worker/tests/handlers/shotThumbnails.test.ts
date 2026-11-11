import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFfmpegRun, fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, uploadDone, uploads } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);
vi.mock("@aws-sdk/lib-storage", async () => (await import("./mocks.ts")).libStorage);

import { shotThumbnails } from "../../src/handlers/shotThumbnails.ts";

/** A snapshot at 25 fps starting at 01:00:00:00 with one 50-frame clip per shot */
function snapshot(shotCount: number) {
	return {
		id: "t",
		name: "t",
		frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
		startFrameIndex: 90000,
		durationFrameCount: shotCount * 50,
		metadata: {},
		mediaItems: [],
		tracks: [
			{
				id: "v1",
				type: "video",
				name: "V1",
				clips: Array.from({ length: shotCount }, (_, i) => ({
					id: `c${i}`,
					name: `c${i}`,
					mediaId: null,
					startFrameIndex: 90000 + i * 50,
					durationFrameCount: 50,
					sourceStartFrameIndex: null,
					speed: 1,
					metadata: {},
					color: null,
				})),
			},
		],
	};
}

const seekArgs = () =>
	ffmpegLib.ffmpeg.mock.calls.map(([args]: [string[]]) => args[args.indexOf("-ss") + 1]);

beforeEach(() => {
	resetMocks();
	prisma.export.findUniqueOrThrow.mockResolvedValue({ timelineSnapshot: snapshot(3) });
	ffmpegLib.ffmpeg.mockImplementation(() => fakeFfmpegRun([Buffer.from("jpg")]));
});

describe("shotThumbnails", () => {
	it("needs a timeline snapshot on the export", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ timelineSnapshot: null });
		await expect(
			shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never),
		).rejects.toThrow("shotThumbnails needs a timeline snapshot");
		expect(prisma.export.findUniqueOrThrow).toHaveBeenCalledWith({ where: { mediaId: "m1" } });
	});

	it("seeks to the middle frame of each shot, relative to the timeline start", async () => {
		await shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never);
		// shot i's thumbnail frame is 25 frames in; secondsAtFrame adds half a frame
		expect(seekArgs()).toEqual(["1.02", "3.02", "5.02"]);
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
		expect(args[args.indexOf("-i") + 1]).toBe("https://s3/m1/original");
	});

	it("uploads one JPEG per shot under its index and stores the count", async () => {
		await shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never);
		expect(uploads.map((u) => u.params.Key).sort()).toEqual([
			"m1/shotThumbnails-0",
			"m1/shotThumbnails-1",
			"m1/shotThumbnails-2",
		]);
		expect(uploads[0]!.params).toMatchObject({ Bucket: "bucket", ContentType: "image/jpeg" });
		expect(uploads[0]!.body).toEqual(Buffer.from("jpg"));
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { shotThumbnails: { count: 3, width: 320, height: 180 } },
		});
	});

	it("reports progress after each shot", async () => {
		const job = fakeJob("shotThumbnails", { mediaId: "m1" });
		await shotThumbnails(job as never);
		expect(job.updateProgress.mock.calls.map(([p]) => p)).toEqual([1 / 3, 2 / 3, 1]);
	});

	it("renders every shot exactly once with at most 4 in parallel", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ timelineSnapshot: snapshot(10) });
		let running = 0;
		let maxRunning = 0;
		uploadDone.mockImplementation(async () => {
			maxRunning = Math.max(maxRunning, ++running);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running--;
		});
		await shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never);
		expect(maxRunning).toBe(4);
		expect(new Set(uploads.map((u) => u.params.Key)).size).toBe(10);
		expect(ffmpegLib.ffmpeg).toHaveBeenCalledTimes(10);
	});

	it("stores a count of 0 for a timeline without shots", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ timelineSnapshot: snapshot(0) });
		await shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never);
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
		expect(prisma.media.update.mock.calls[0]![0].data.shotThumbnails.count).toBe(0);
	});

	it("fails without storing the count when a render fails", async () => {
		ffmpegLib.ffmpeg.mockImplementation(() =>
			fakeFfmpegRun([], new Error("ffmpeg exited with code 1")),
		);
		await expect(
			shotThumbnails(fakeJob("shotThumbnails", { mediaId: "m1" }) as never),
		).rejects.toThrow("ffmpeg exited");
		expect(prisma.media.update).not.toHaveBeenCalled();
	});
});
