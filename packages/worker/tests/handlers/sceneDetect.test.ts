import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { webUploadSnapshot } from "@postpin-io/shared/logic/web-upload";
import { fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, storage } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);

import { sceneDetect } from "../../src/handlers/sceneDetect.ts";

const recorded = readFileSync(new URL("../fixtures/three-cuts.scenes.txt", import.meta.url));
const job = () => fakeJob("sceneDetect", { mediaId: "m1" });
const FPS_24 = { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false };

const snapshot = (cutLevel: "medium" | "none" = "medium") =>
	webUploadSnapshot({
		id: "e1",
		name: "Trailer",
		fileName: "trailer.mp4",
		timing: { frameRate: FPS_24, startFrameIndex: 86400, durationFrameCount: 192 },
		userSet: [],
		cutLevel,
	});

beforeEach(() => {
	resetMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	ffmpegLib.ffmpeg.mockImplementation(() => ({
		stdout: Readable.from([recorded]),
		done: new Promise((resolve) => setTimeout(resolve, 5)),
	}));
});

describe("sceneDetect", () => {
	it("stores the scores and splits the snapshot into the estimated shots", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ id: "e1", timelineSnapshot: snapshot() });
		await sceneDetect(job() as never);

		expect(storage.getOriginalUrl).toHaveBeenCalledWith("m1");
		expect(ffmpegLib.ffmpeg.mock.calls[0]![0]).toContain("https://s3/m1/original");
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				sceneScores: {
					scores: [
						[48, 1],
						[96, 1],
						[144, 1],
					],
				},
			},
		});
		const stored = prisma.export.update.mock.calls[0]![0];
		expect(stored.where).toEqual({ id: "e1" });
		expect(
			stored.data.timelineSnapshot.tracks[0].clips.map(
				(c: { name: string; startFrameIndex: number }) => [c.name, c.startFrameIndex],
			),
		).toEqual([
			["Shot 1 (estimated)", 86400],
			["Shot 2 (estimated)", 86448],
			["Shot 3 (estimated)", 86496],
			["Shot 4 (estimated)", 86544],
		]);
	});

	it("reports ffmpeg's progress", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ id: "e1", timelineSnapshot: snapshot() });
		const j = job();
		await sceneDetect(j as never);
		const onProgress = ffmpegLib.ffmpeg.mock.calls[0]![1] as (f: number) => void;
		onProgress(0.5);
		expect(j.updateProgress).toHaveBeenCalledWith(0.5);
	});

	it("refuses snapshots of plugins", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({
			id: "e1",
			timelineSnapshot: { ...snapshot(), metadata: {} },
		});
		await expect(sceneDetect(job() as never)).rejects.toThrow("only works on web uploads");
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
	});

	it("stores nothing when ffmpeg fails", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({ id: "e1", timelineSnapshot: snapshot() });
		ffmpegLib.ffmpeg.mockImplementation(() => ({
			stdout: Readable.from([]),
			done: Promise.reject(new Error("ffmpeg exited with code 1")),
		}));
		await expect(sceneDetect(job() as never)).rejects.toThrow("ffmpeg exited");
		expect(prisma.media.update).not.toHaveBeenCalled();
		expect(prisma.export.update).not.toHaveBeenCalled();
	});
});
