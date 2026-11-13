import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, storage } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/ffmpeg.ts", async (importOriginal) => ({
	...(await import("./mocks.ts")).ffmpegLib,
	probedTimecode: (await importOriginal<typeof import("../../src/lib/ffmpeg.ts")>()).probedTimecode,
}));

import { probe } from "../../src/handlers/probe.ts";
import { webUploadSnapshot } from "@postpin-io/shared/logic/web-upload";

const job = () => fakeJob("probe", { mediaId: "m1" }) as never;

beforeEach(() => {
	resetMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("probe", () => {
	it("probes the original and stores its format, video and audio details", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({
			streams: [
				{ index: 0, codec_type: "data" },
				{
					index: 1,
					codec_type: "video",
					codec_name: "prores",
					width: 3840,
					height: 2160,
					avg_frame_rate: 25,
				},
				{ index: 2, codec_type: "audio", codec_name: "pcm_s24le", sample_rate: 48000, channels: 6 },
				{ index: 3, codec_type: "audio", codec_name: "aac", sample_rate: 44100, channels: 2 },
			],
			format: {
				format_name: "mov,mp4",
				duration: 12.5,
				size: 5_000_000_000,
				bit_rate: 3_200_000_000,
			},
		});
		await probe(job());

		expect(storage.getOriginalUrl).toHaveBeenCalledWith("m1");
		expect(ffmpegLib.ffprobe).toHaveBeenCalledWith("https://s3/m1/original");
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				original: {
					update: {
						status: "COMPLETED",
						contentType: "mov,mp4",
						size: 5_000_000_000n,
						duration: 12.5,
						bitrate: 3_200_000_000,
						videoCodec: "prores",
						width: 3840,
						height: 2160,
						frameRate: 25,
						// the first audio stream wins
						audioCodec: "pcm_s24le",
						sampleRate: 48000,
						channels: 6,
					},
				},
			},
		});
	});

	it("stores nulls for missing streams and format fields, and a 0 frame rate as null", async () => {
		// size stays undefined: Prisma then keeps the reservation init-upload stored
		ffmpegLib.ffprobe.mockResolvedValue({
			streams: [{ index: 0, codec_type: "video", width: 100, height: 100, avg_frame_rate: 0 }],
			format: { format_name: "png_pipe" },
		});
		await probe(job());
		expect(prisma.media.update.mock.calls[0]![0].data.original.update).toEqual({
			status: "COMPLETED",
			contentType: "png_pipe",
			size: undefined,
			duration: null,
			bitrate: null,
			videoCodec: null,
			width: 100,
			height: 100,
			frameRate: null,
			audioCodec: null,
			sampleRate: null,
			channels: null,
		});
	});

	it("keeps a size of 0 instead of turning it into null", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({ streams: [], format: { format_name: "x", size: 0 } });
		await probe(job());
		expect(prisma.media.update.mock.calls[0]![0].data.original.update.size).toBe(0n);
	});

	it("does not write anything when ffprobe fails", async () => {
		ffmpegLib.ffprobe.mockRejectedValue(new Error("ffprobe exited with code 1"));
		await expect(probe(job())).rejects.toThrow("ffprobe exited");
		expect(prisma.media.update).not.toHaveBeenCalled();
	});
});

describe("probe of a web upload", () => {
	const estimate = (userSet: ("frameRate" | "startFrameIndex")[] = []) =>
		webUploadSnapshot({
			id: "e1",
			name: "Clip",
			fileName: "clip.mov",
			timing: {
				frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
				startFrameIndex: 0,
				durationFrameCount: 100,
			},
			userSet,
			cutLevel: "medium",
		});

	const mov = {
		streams: [
			{
				index: 0,
				codec_type: "video",
				codec_name: "prores",
				width: 1920,
				height: 1080,
				avg_frame_rate: 29.97002997,
				r_frame_rate: 29.97002997,
				nb_frames: 60,
				duration: 2.002,
			},
			// QuickTime keeps the timecode in a tmcd data stream
			{ index: 1, codec_type: "data", tags: { timecode: "00:59:58;00" } },
		],
		format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: 2.002 },
	};

	it("replaces the form's estimates with the file's rate, timecode and length", async () => {
		ffmpegLib.ffprobe.mockResolvedValue(mov);
		prisma.export.findUnique.mockResolvedValue({ id: "e1", timelineSnapshot: estimate() });
		await probe(job());

		expect(prisma.export.findUnique).toHaveBeenCalledWith({
			where: { mediaId: "m1" },
			select: { id: true, timelineSnapshot: true },
		});
		const { where, data } = prisma.export.update.mock.calls[0]![0];
		expect(where).toEqual({ id: "e1" });
		expect(data.timelineSnapshot).toMatchObject({
			frameRate: { fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: true },
			startFrameIndex: 107832,
			durationFrameCount: 60,
		});
	});

	it("keeps the values the uploader set", async () => {
		ffmpegLib.ffprobe.mockResolvedValue(mov);
		prisma.export.findUnique.mockResolvedValue({
			id: "e1",
			timelineSnapshot: estimate(["frameRate", "startFrameIndex"]),
		});
		await probe(job());
		expect(prisma.export.update.mock.calls[0]![0].data.timelineSnapshot).toMatchObject({
			frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
			startFrameIndex: 0,
			// the file's 60 frames at 29.97 last 2.002 s, which are 50 frames at the chosen 25
			durationFrameCount: 50,
		});
	});

	it("MXF: reads the timecode from the format tags and computes the length", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({
			streams: [
				{
					index: 0,
					codec_type: "video",
					codec_name: "mpeg2video",
					width: 1920,
					height: 1080,
					avg_frame_rate: 25,
				},
			],
			format: { format_name: "mxf", duration: 4, tags: { timecode: "01:00:00:00" } },
		});
		prisma.export.findUnique.mockResolvedValue({ id: "e1", timelineSnapshot: estimate() });
		await probe(job());
		expect(prisma.export.update.mock.calls[0]![0].data.timelineSnapshot).toMatchObject({
			frameRate: { fpsNumerator: 25, fpsDenominator: 1 },
			startFrameIndex: 90000,
			durationFrameCount: 100,
		});
	});

	it("leaves plugin snapshots alone", async () => {
		ffmpegLib.ffprobe.mockResolvedValue(mov);
		prisma.export.findUnique.mockResolvedValue({ id: "e1", timelineSnapshot: { metadata: {} } });
		await probe(job());
		expect(prisma.export.update).not.toHaveBeenCalled();
	});
});
