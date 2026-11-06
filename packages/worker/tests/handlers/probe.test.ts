import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, storage } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);

import { probe } from "../../src/handlers/probe.ts";

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
		ffmpegLib.ffprobe.mockResolvedValue({
			streams: [{ index: 0, codec_type: "video", width: 100, height: 100, avg_frame_rate: 0 }],
			format: { format_name: "png_pipe" },
		});
		await probe(job());
		expect(prisma.media.update.mock.calls[0]![0].data.original.update).toEqual({
			status: "COMPLETED",
			contentType: "png_pipe",
			size: null,
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
