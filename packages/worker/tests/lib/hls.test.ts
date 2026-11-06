import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";

const ffmpegLib = vi.hoisted(() => ({ ffmpeg: vi.fn(), ffprobe: vi.fn() }));
vi.mock("../../src/lib/ffmpeg.ts", () => ffmpegLib);

import { encodeHls, parseHlsPlaylist } from "../../src/lib/hls.ts";

const playlist = (segments: [duration: number, length: number, offset: number][], init = "800@0") =>
	[
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:0",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="pipe:1",BYTERANGE="${init}"`,
		...segments.flatMap(([d, l, o]) => [
			`#EXTINF:${d.toFixed(6)},`,
			`#EXT-X-BYTERANGE:${l}@${o}`,
			"pipe:1",
		]),
		"#EXT-X-ENDLIST",
		"",
	].join("\n");

describe("parseHlsPlaylist", () => {
	it("reads the init section and every segment's byte range", () => {
		expect(
			parseHlsPlaylist(
				playlist([
					[2.002, 1000, 800],
					[2.002, 1200, 1800],
					[0.5, 300, 3000],
				]),
			),
		).toEqual({
			init: { length: 800, offset: 0 },
			segments: [
				{ duration: 2.002, length: 1000, offset: 800 },
				{ duration: 2.002, length: 1200, offset: 1800 },
				{ duration: 0.5, length: 300, offset: 3000 },
			],
		});
	});

	it("accepts CRLF line endings", () => {
		expect(
			parseHlsPlaylist(playlist([[2, 10, 5]], "5@0").replaceAll("\n", "\r\n")).segments,
		).toHaveLength(1);
	});

	it("throws without an init section", () => {
		const text = playlist([[2, 10, 5]]).replace(/#EXT-X-MAP.*\n/, "");
		expect(() => parseHlsPlaylist(text)).toThrow("ffmpeg playlist has no byte ranges");
	});

	it("throws without segments, e.g. a playlist written without single_file", () => {
		expect(() => parseHlsPlaylist(playlist([]))).toThrow("ffmpeg playlist has no byte ranges");
		const separateFiles =
			'#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="5@0"\n#EXTINF:2.0,\nseg0.m4s\n';
		expect(() => parseHlsPlaylist(separateFiles)).toThrow("ffmpeg playlist has no byte ranges");
	});
});

describe("encodeHls", () => {
	const rendition = { width: 854, height: 480, videoBitRate: 1_000_000, audioBitRate: 128_000 };
	let playlistDir: string | undefined;

	/** Makes the mocked ffmpeg write `media` to stdout and `text` as the playlist */
	function ffmpegWrites(media: Buffer[], text: string, error?: Error) {
		ffmpegLib.ffmpeg.mockImplementation((args: string[], onProgress?: (p: number) => void) => {
			const playlistPath = args.at(-1)!;
			playlistDir = path.dirname(playlistPath);
			writeFileSync(playlistPath, text);
			onProgress?.(0.5);
			const stdout = new PassThrough();
			let done: Promise<void>;
			if (error) {
				stdout.write(media[0]);
				done = Promise.reject(error);
			} else {
				for (const chunk of media) stdout.write(chunk);
				stdout.end();
				done = Promise.resolve();
			}
			return { stdout, done };
		});
	}

	async function collect(body: Readable) {
		const chunks: Buffer[] = [];
		for await (const chunk of body) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks);
	}

	beforeEach(() => {
		playlistDir = undefined;
		ffmpegLib.ffprobe.mockReset().mockResolvedValue({
			streams: [{ codec_type: "video" }, { codec_type: "audio" }],
		});
		ffmpegLib.ffmpeg.mockReset();
	});
	afterEach(() => {
		// the temporary playlist directory is always removed
		if (playlistDir) expect(existsSync(playlistDir)).toBe(false);
	});

	it("streams ffmpeg's output into the sink and returns the playlist, size and codecs", async () => {
		const media = [Buffer.alloc(800, 1), Buffer.alloc(1000, 2), Buffer.alloc(500, 3)];
		ffmpegWrites(
			media,
			playlist([
				[2, 1000, 800],
				[1, 500, 1800],
			]),
		);
		let received: Buffer | undefined;
		const onProgress = vi.fn();

		const result = await encodeHls(
			"https://s3/original",
			rendition,
			async (body) => (received = await collect(body)),
			onProgress,
		);

		expect(received).toEqual(Buffer.concat(media));
		expect(result).toEqual({
			hls: {
				init: { length: 800, offset: 0 },
				segments: [
					{ duration: 2, length: 1000, offset: 800 },
					{ duration: 1, length: 500, offset: 1800 },
				],
			},
			bytes: 2300,
			codecs: "avc1.64002a,mp4a.40.2",
			hasAudio: true,
		});
		expect(onProgress).toHaveBeenCalledWith(0.5);
	});

	it("probes the input and passes the rendition into the ffmpeg args", async () => {
		ffmpegWrites([Buffer.alloc(30)], playlist([[2, 20, 10]], "10@0"));
		await encodeHls("in.mov", rendition, collect);

		expect(ffmpegLib.ffprobe).toHaveBeenCalledWith("in.mov");
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after("-i")).toBe("in.mov");
		expect(after("-b:v")).toBe("1000000");
		expect(after("-maxrate")).toBe("1500000");
		expect(after("-bufsize")).toBe("2000000");
		expect(after("-vf")).toMatch(/^scale=854:480:force_original_aspect_ratio=decrease,/);
		expect(after("-b:a")).toBe("128000");
		expect(after("-c:a")).toBe("aac");
		expect(after("-hls_segment_filename")).toBe("pipe:1");
		expect(args.at(-1)).toMatch(/index\.m3u8$/);
	});

	it("leaves out the audio settings and codec for media without audio", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({ streams: [{ codec_type: "video" }] });
		ffmpegWrites([Buffer.alloc(30)], playlist([[2, 20, 10]], "10@0"));
		const result = await encodeHls("in.mov", rendition, collect);

		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args).not.toContain("-c:a");
		expect(args).not.toContain("-af");
		expect(result.hasAudio).toBe(false);
		expect(result.codecs).toBe("avc1.64002a");
	});

	it("throws when the playlist doesn't end where ffmpeg's output ends", async () => {
		ffmpegWrites([Buffer.alloc(29)], playlist([[2, 20, 10]], "10@0"));
		await expect(encodeHls("in.mov", rendition, collect)).rejects.toThrow(
			"Playlist ends at byte 30, but ffmpeg wrote 29",
		);
	});

	it("fails the sink's stream when ffmpeg fails, so no partial file is stored", async () => {
		ffmpegWrites(
			[Buffer.alloc(10)],
			playlist([[2, 20, 10]], "10@0"),
			new Error("ffmpeg exited with code 1"),
		);
		let sinkError: unknown;
		await expect(
			encodeHls("in.mov", rendition, (body) =>
				collect(body).catch((error: unknown) => {
					sinkError = error;
					throw error;
				}),
			),
		).rejects.toThrow("ffmpeg exited with code 1");
		expect(sinkError).toBeInstanceOf(Error);
		expect((sinkError as Error).message).toBe("ffmpeg exited with code 1");
	});

	it("propagates a failing ffprobe without starting ffmpeg", async () => {
		ffmpegLib.ffprobe.mockRejectedValue(new Error("ffprobe exited with code 1"));
		await expect(encodeHls("in.mov", rendition, collect)).rejects.toThrow("ffprobe exited");
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
	});
});
