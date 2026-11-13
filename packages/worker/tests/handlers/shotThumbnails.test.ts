import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFfmpegRun, fakeJob } from "../helpers.ts";
import {
	ffmpegLib,
	prisma,
	resetMocks,
	s3Client,
	sharedStorage,
	uploadDone,
	uploads,
} from "./mocks.ts";

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

const job = (generation = "g2") => fakeJob("shotThumbnails", { mediaId: "m1", generation });
/** The export as the handler reads it, with the media's current generation */
const exportRow = (shotCount: number | null, generation = "g2") => ({
	timelineSnapshot: shotCount === null ? null : snapshot(shotCount),
	media: { shotThumbnailsGeneration: generation },
});

const seekArgs = () =>
	ffmpegLib.ffmpeg.mock.calls.map(([args]: [string[]]) => args[args.indexOf("-ss") + 1]);

beforeEach(() => {
	resetMocks();
	prisma.export.findUniqueOrThrow.mockResolvedValue(exportRow(3));
	prisma.media.updateMany.mockResolvedValue({ count: 1 });
	ffmpegLib.ffmpeg.mockImplementation(() => fakeFfmpegRun([Buffer.from("jpg")]));
});

describe("shotThumbnails", () => {
	it("needs a timeline snapshot on the export", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue(exportRow(null));
		await expect(shotThumbnails(job() as never)).rejects.toThrow(
			"shotThumbnails needs a timeline snapshot",
		);
		expect(prisma.export.findUniqueOrThrow).toHaveBeenCalledWith({
			where: { mediaId: "m1" },
			select: { timelineSnapshot: true, media: { select: { shotThumbnailsGeneration: true } } },
		});
	});

	it("seeks to the middle frame of each shot, relative to the timeline start", async () => {
		await shotThumbnails(job() as never);
		// shot i's thumbnail frame is 25 frames in; secondsAtFrame adds half a frame
		expect(seekArgs()).toEqual(["1.02", "3.02", "5.02"]);
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
		expect(args[args.indexOf("-i") + 1]).toBe("https://s3/m1/original");
	});

	it("uploads one JPEG per shot under its generation and index and publishes the count", async () => {
		await shotThumbnails(job() as never);
		expect(uploads.map((u) => u.params.Key).sort()).toEqual([
			"m1/shotThumbnails-g2-0",
			"m1/shotThumbnails-g2-1",
			"m1/shotThumbnails-g2-2",
		]);
		expect(uploads[0]!.params).toMatchObject({ Bucket: "bucket", ContentType: "image/jpeg" });
		expect(uploads[0]!.body).toEqual(Buffer.from("jpg"));
		expect(prisma.media.updateMany).toHaveBeenCalledWith({
			where: { id: "m1", shotThumbnailsGeneration: "g2" },
			data: { shotThumbnails: { count: 3, width: 320, height: 180, generation: "g2" } },
		});
	});

	it("after publishing, deletes the older generations but keeps its own and newer ones", async () => {
		await shotThumbnails(job("g2") as never);
		expect(sharedStorage.deleteShotThumbnails).toHaveBeenCalledTimes(1);
		const [client, , mediaId, matches] = sharedStorage.deleteShotThumbnails.mock
			.calls[0]! as unknown as [unknown, unknown, string, (g: string | null) => boolean];
		expect([client, mediaId]).toEqual([s3Client, "m1"]);
		expect([null, "g1", "g2", "g3"].filter(matches)).toEqual([null, "g1"]);
	});

	it("doesn't render at all when a newer render was requested before it started", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue(exportRow(3, "g3"));
		await shotThumbnails(job("g2") as never);
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
		expect(prisma.media.updateMany).not.toHaveBeenCalled();
		expect(sharedStorage.deleteShotThumbnails).not.toHaveBeenCalled();
	});

	it("doesn't publish when it was overtaken while rendering, and deletes its own images", async () => {
		prisma.media.updateMany.mockResolvedValue({ count: 0 });
		await shotThumbnails(job("g2") as never);
		expect(sharedStorage.deleteShotThumbnails).toHaveBeenCalledTimes(1);
		const matches = sharedStorage.deleteShotThumbnails.mock.calls[0]![3] as unknown as (
			g: string | null,
		) => boolean;
		expect([null, "g1", "g2", "g3"].filter(matches)).toEqual(["g2"]);
	});

	it("an older render that finishes last leaves the newer one published", async () => {
		// a tiny database: the media's generation and what was published
		const db = {
			generation: "g1",
			snapshot: snapshot(3),
			published: null as unknown,
		};
		prisma.export.findUniqueOrThrow.mockImplementation(async () => ({
			timelineSnapshot: db.snapshot,
			media: { shotThumbnailsGeneration: db.generation },
		}));
		prisma.media.updateMany.mockImplementation(
			async ({ where, data }: { where: { shotThumbnailsGeneration: string }; data: object }) => {
				if (where.shotThumbnailsGeneration !== db.generation) return { count: 0 };
				db.published = (data as { shotThumbnails: unknown }).shotThumbnails;
				return { count: 1 };
			},
		);
		// g1 is still rendering when the cuts change to 5 shots (g2), whose render finishes first
		let release!: () => void;
		const g1Blocked = new Promise<void>((resolve) => (release = resolve));
		uploadDone.mockImplementationOnce(async () => {
			db.generation = "g2";
			db.snapshot = snapshot(5);
			await shotThumbnails(job("g2") as never);
			release();
		});
		const g1 = shotThumbnails(job("g1") as never);
		await g1Blocked;
		await g1;

		expect(db.published).toEqual({ count: 5, width: 320, height: 180, generation: "g2" });
		// g1 cleaned up its own images, g2 the ones older than itself
		const deleted = sharedStorage.deleteShotThumbnails.mock.calls.map(
			(c) => (c as unknown as [unknown, unknown, string, (g: string | null) => boolean])[3],
		);
		expect(deleted.map((matches) => ["g1", "g2"].filter(matches))).toEqual([["g1"], ["g1"]]);
	});

	it("reports progress after each shot", async () => {
		const j = job();
		await shotThumbnails(j as never);
		expect(j.updateProgress.mock.calls.map(([p]) => p)).toEqual([1 / 3, 2 / 3, 1]);
	});

	it("renders every shot exactly once with at most 4 in parallel", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue(exportRow(10));
		let running = 0;
		let maxRunning = 0;
		uploadDone.mockImplementation(async () => {
			maxRunning = Math.max(maxRunning, ++running);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running--;
		});
		await shotThumbnails(job() as never);
		expect(maxRunning).toBe(4);
		expect(new Set(uploads.map((u) => u.params.Key)).size).toBe(10);
		expect(ffmpegLib.ffmpeg).toHaveBeenCalledTimes(10);
	});

	it("stores a count of 0 for a timeline without shots", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue(exportRow(0));
		await shotThumbnails(job() as never);
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
		expect(prisma.media.updateMany.mock.calls[0]![0].data.shotThumbnails.count).toBe(0);
	});

	it("fails without storing the count when a render fails", async () => {
		ffmpegLib.ffmpeg.mockImplementation(() =>
			fakeFfmpegRun([], new Error("ffmpeg exited with code 1")),
		);
		await expect(shotThumbnails(job() as never)).rejects.toThrow("ffmpeg exited");
		expect(prisma.media.updateMany).not.toHaveBeenCalled();
	});
});
