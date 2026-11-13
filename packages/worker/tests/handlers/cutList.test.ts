import { beforeEach, describe, expect, it, vi } from "vitest";
import { webUploadSnapshot } from "@postpin-io/shared/logic/web-upload";
import type { CutList } from "@postpin-io/shared/logic/cut-list";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { fakeJob } from "../helpers.ts";
import { prisma, resetMocks, s3Client, sharedStorage } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);

import { cutList } from "../../src/handlers/cutList.ts";

const FPS_25 = { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };
/** A probed web upload at 25 fps from 01:00:00:00, 8 s long, still one clip */
const probed = () =>
	webUploadSnapshot({
		id: "e1",
		name: "Trailer",
		fileName: "trailer.mp4",
		timing: { frameRate: FPS_25, startFrameIndex: 90000, durationFrameCount: 200 },
		userSet: [],
		cutLevel: "none",
	});
const event = (name: string, from: string, to: string) => ({
	name,
	in: from,
	out: to,
	sourceIn: "00:00:10:00",
});
const LIST: CutList = {
	format: "fcpxml",
	title: "Trailer",
	frameRate: FPS_25,
	tracks: [
		{
			type: "video",
			name: "Video 1",
			events: [
				event("A001.mov", "01:00:00:00", "01:00:03:05"),
				event("B002.mov", "01:00:03:05", "01:00:08:00"),
			],
		},
		{ type: "video", name: "Video 2", events: [event("Insert.mov", "01:00:01:00", "01:00:02:00")] },
		{ type: "audio", name: "Audio 1", events: [event("Music.wav", "01:00:00:00", "01:00:08:00")] },
	],
	markers: [],
};
const marker = (name: string, at: string, label = "Blue") => ({
	name,
	note: "a note",
	at,
	duration: 0,
	host: "Resolve" as const,
	label,
});

const job = () => fakeJob("cutList", { mediaId: "m1" });
const stored = () => prisma.export.update.mock.calls[0]![0];
const stores = (list: unknown) =>
	sharedStorage.getTextObject.mockResolvedValue(JSON.stringify(list));

beforeEach(() => {
	resetMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	prisma.export.findUniqueOrThrow.mockResolvedValue({
		id: "e1",
		timelineSnapshot: probed(),
		cutListKey: "m1/cutList",
		uploadedById: "u1",
		timeline: { projectId: "p1" },
	});
	prisma.category.upsert.mockImplementation(async ({ create }: { create: { name: string } }) => ({
		id: `cat-${create.name}`,
	}));
	prisma.marker.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
		count: data.length,
	}));
	stores(LIST);
});

describe("cutList", () => {
	it("makes the list's video and audio tracks the snapshot's", async () => {
		expect(await cutList(job() as never)).toEqual({ tracks: 3, markers: 0, error: null });
		expect(sharedStorage.getTextObject).toHaveBeenCalledWith(
			s3Client,
			expect.anything(),
			"m1/cutList",
		);
		const { where, data } = stored();
		expect(where).toEqual({ id: "e1" });
		expect(data.cutListError).toBeNull();
		const snapshot = data.timelineSnapshot as TimelineSnapshot;
		expect(snapshot.metadata.cutsFrom).toBe("fcpxml");
		expect(
			snapshot.tracks.map((t) => [
				t.id,
				t.clips.map((c) => [c.name, c.startFrameIndex, c.durationFrameCount]),
			]),
		).toEqual([
			[
				"V1",
				[
					["A001.mov", 90000, 80],
					["B002.mov", 90080, 120],
				],
			],
			["V2", [["Insert.mov", 90025, 25]]],
			["A1", [["Music.wav", 90000, 200]]],
		]);
	});

	it("a list that doesn't fit: the reason is stored, the tracks stay", async () => {
		// frame 29 doesn't exist at 25 fps, and an EDL counts in the timeline's rate
		stores({
			...LIST,
			format: "edl",
			frameRate: null,
			tracks: [
				{ type: "video", name: "Video 1", events: [event("A", "01:00:00:00", "01:00:00:29")] },
			],
		});
		expect(await cutList(job() as never)).toEqual({
			tracks: null,
			markers: null,
			error: "Video 1, clip 1: 01:00:00:29 doesn't fit the frame rate",
		});
		expect(stored()).toEqual({
			where: { id: "e1" },
			data: { cutListError: "Video 1, clip 1: 01:00:00:29 doesn't fit the frame rate" },
		});
	});

	it("a stored list that isn't one fails the job instead of being guessed at", async () => {
		sharedStorage.getTextObject.mockResolvedValue('{"format":"aaf"}');
		await expect(cutList(job() as never)).rejects.toThrow();
		expect(prisma.export.update).not.toHaveBeenCalled();
	});

	it("storage errors fail the job, so it is tried again", async () => {
		sharedStorage.getTextObject.mockRejectedValue(new Error("SlowDown"));
		await expect(cutList(job() as never)).rejects.toThrow("SlowDown");
		expect(prisma.export.update).not.toHaveBeenCalled();
	});

	it("needs a web upload with a cut list", async () => {
		prisma.export.findUniqueOrThrow.mockResolvedValue({
			id: "e1",
			timelineSnapshot: { metadata: {} },
			cutListKey: "m1/cutList",
		});
		await expect(cutList(job() as never)).rejects.toThrow("only works on web uploads");
		prisma.export.findUniqueOrThrow.mockResolvedValue({
			id: "e1",
			timelineSnapshot: probed(),
			cutListKey: null,
		});
		await expect(cutList(job() as never)).rejects.toThrow("has no cut list");
	});

	it("the markers become PostPin markers of the uploader, in a category per color", async () => {
		stores({
			...LIST,
			markers: [
				marker("Fix the grade", "01:00:01:00"),
				marker("Too loud", "01:00:02:00", "Red"),
				marker("Again", "01:00:03:00"),
				// outside the video: left out
				marker("Later", "01:00:30:00"),
			],
		});
		expect(await cutList(job() as never)).toEqual({ tracks: 3, markers: 3, error: null });

		expect(prisma.category.upsert.mock.calls.map(([a]) => a)).toEqual([
			{
				where: { projectId_name: { projectId: "p1", name: "Resolve Blue" } },
				create: { projectId: "p1", name: "Resolve Blue", color: "#008feb", createdById: "u1" },
				update: {},
				select: { id: true },
			},
			expect.objectContaining({
				create: { projectId: "p1", name: "Resolve Red", color: "#fc0000", createdById: "u1" },
			}),
		]);
		const { data, skipDuplicates } = prisma.marker.createMany.mock.calls[0]![0];
		expect(skipDuplicates).toBe(true);
		expect(data).toEqual([
			{
				exportId: "e1",
				nleId: expect.stringMatching(/^cutList:[0-9a-f]{8}$/),
				name: "Fix the grade",
				description: "a note",
				frame: 90025,
				duration: 0,
				categoryId: "cat-Resolve Blue",
				authorId: "u1",
			},
			expect.objectContaining({ frame: 90050, categoryId: "cat-Resolve Red" }),
			expect.objectContaining({ frame: 90075, categoryId: "cat-Resolve Blue" }),
		]);
	});

	it("a list with only markers keeps the snapshot's tracks", async () => {
		stores({ ...LIST, tracks: [], markers: [marker("Fix", "01:00:01:00")] });
		await cutList(job() as never);
		const snapshot = stored().data.timelineSnapshot as TimelineSnapshot;
		expect(snapshot.tracks).toEqual(probed().tracks);
		expect(snapshot.metadata.cutsFrom).toBeUndefined();
		expect(prisma.marker.createMany).toHaveBeenCalled();
	});
});
