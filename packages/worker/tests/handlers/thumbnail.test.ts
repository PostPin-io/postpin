import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFfmpegRun, fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, uploads } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);
vi.mock("@aws-sdk/lib-storage", async () => (await import("./mocks.ts")).libStorage);

import { thumbnail } from "../../src/handlers/thumbnail.ts";

type Size = { width: number } | { height: number } | { width: number; height: number };
const run = (size: Size, frame = 42) =>
	thumbnail(fakeJob("thumbnail", { mediaId: "m1", frame, size }) as never);
const vfArg = () => {
	const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
	return args[args.indexOf("-vf") + 1];
};

beforeEach(() => {
	resetMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	ffmpegLib.ffmpeg.mockImplementation(() => fakeFfmpegRun([Buffer.from("png")]));
});

describe("thumbnail", () => {
	it("selects the frame from the original and uploads it as PNG", async () => {
		await run({ width: 320 });
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args[args.indexOf("-i") + 1]).toBe("https://s3/m1/original");
		expect(args.at(-1)).toBe("pipe:1");
		expect(uploads).toHaveLength(1);
		expect(uploads[0]!.params).toMatchObject({
			Bucket: "bucket",
			Key: "m1/thumbnail",
			ContentType: "image/png",
		});
		expect(uploads[0]!.body).toEqual(Buffer.from("png"));
	});

	it.each([
		[{ width: 320 }, "select=eq(n\\,42),scale=320:-2"],
		[{ height: 180 }, "select=eq(n\\,42),scale=-2:180"],
		[{ width: 320, height: 180 }, "select=eq(n\\,42),scale=320:180"],
	])("scales to %j", async (size, expected) => {
		await run(size);
		expect(vfArg()).toBe(expected);
	});

	it("upserts the thumbnail record after the upload", async () => {
		await run({ width: 320 }, 7);
		const record = { contentType: "image/png", frame: 7, status: "COMPLETED" };
		expect(prisma.thumbnail.upsert).toHaveBeenCalledWith({
			where: { mediaId: "m1" },
			update: record,
			create: { mediaId: "m1", ...record },
		});
	});

	it("does not record a thumbnail when ffmpeg fails", async () => {
		ffmpegLib.ffmpeg.mockImplementation(() =>
			fakeFfmpegRun([], new Error("ffmpeg exited with code 1")),
		);
		await expect(run({ width: 320 })).rejects.toThrow("ffmpeg exited");
		expect(prisma.thumbnail.upsert).not.toHaveBeenCalled();
	});
});
