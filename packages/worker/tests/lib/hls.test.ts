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
	const r480 = { width: 854, height: 480, videoBitRate: 1_000_000, audioBitRate: 128_000 };
	const r720 = { width: 1280, height: 720, videoBitRate: 3_500_000, audioBitRate: 128_000 };
	let playlistDir: string | undefined;

	interface Output {
		media: Buffer[];
		playlist: string;
	}

	/** Makes the mocked ffmpeg write each output's media to its pipe and its playlist to disk */
	function ffmpegWrites(outputs: Output[], error?: Error) {
		ffmpegLib.ffmpeg.mockImplementation(
			(args: string[], onProgress?: (p: number) => void, count = 0) => {
				expect(count).toBe(outputs.length);
				// each output ends with `-hls_segment_filename pipe:N <playlist>`
				const playlists = args.flatMap((arg, i) =>
					arg === "-hls_segment_filename" ? [args[i + 2]!] : [],
				);
				playlistDir = path.dirname(playlists[0]!);
				onProgress?.(0.5);
				const streams = outputs.map(({ media, playlist }, i) => {
					writeFileSync(playlists[i]!, playlist);
					const stream = new PassThrough();
					if (error) {
						stream.write(media[0]);
					} else {
						for (const chunk of media) stream.write(chunk);
						stream.end();
					}
					return stream;
				});
				const done = error ? Promise.reject(error) : Promise.resolve();
				return { stdout: new PassThrough(), outputs: streams, done };
			},
		);
	}

	const one = (bytes: number, text = playlist([[2, bytes - 10, 10]], "10@0")) => ({
		media: [Buffer.alloc(bytes)],
		playlist: text,
	});

	async function collect(body: Readable) {
		const chunks: Buffer[] = [];
		for await (const chunk of body) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks);
	}
	const sinkAll = (_index: number, body: Readable) => collect(body);

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

	it("streams each output into its sink and returns playlist, size and codecs in rendition order", async () => {
		const media720 = [Buffer.alloc(800, 1), Buffer.alloc(1000, 2), Buffer.alloc(500, 3)];
		ffmpegWrites([
			one(30),
			{
				media: media720,
				playlist: playlist([
					[2, 1000, 800],
					[1, 500, 1800],
				]),
			},
		]);
		const received: Buffer[] = [];
		const onProgress = vi.fn();

		const result = await encodeHls(
			"https://s3/original",
			[r480, r720],
			async (index, body) => (received[index] = await collect(body)),
			onProgress,
		);

		expect(received[0]).toEqual(Buffer.alloc(30));
		expect(received[1]).toEqual(Buffer.concat(media720));
		expect(result).toEqual([
			{
				hls: {
					init: { length: 10, offset: 0 },
					segments: [{ duration: 2, length: 20, offset: 10 }],
				},
				bytes: 30,
				codecs: "avc1.64002a,mp4a.40.2",
				hasAudio: true,
			},
			{
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
			},
		]);
		expect(onProgress).toHaveBeenCalledWith(0.5);
	});

	it("decodes once, splits into every rendition and gives each output its own pipe", async () => {
		ffmpegWrites([one(30), one(30)]);
		await encodeHls("in.mov", [r480, r720], sinkAll);

		expect(ffmpegLib.ffprobe).toHaveBeenCalledWith("in.mov");
		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		const all = (flag: string) => args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));
		expect(args.filter((arg) => arg === "-i")).toHaveLength(1);
		expect(after("-i")).toBe("in.mov");
		expect(after("-filter_complex")).toBe(
			"[0:v:0]split=2[s0][s1];" +
				"[s0]scale=854:480:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v0];" +
				"[s1]scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v1]",
		);
		expect(args).not.toContain("-vf");
		expect(all("-map")).toEqual(["[v0]", "0:a:0?", "[v1]", "0:a:0?"]);
		expect(all("-b:v")).toEqual(["1000000", "3500000"]);
		expect(all("-maxrate")).toEqual(["1500000", "5250000"]);
		expect(all("-bufsize")).toEqual(["2000000", "7000000"]);
		expect(all("-preset")).toEqual(["faster", "faster"]);
		expect(all("-b:a")).toEqual(["128000", "128000"]);
		expect(all("-c:a")).toEqual(["aac", "aac"]);
		expect(all("-hls_segment_filename")).toEqual(["pipe:3", "pipe:4"]);
		expect(args.at(-1)).toMatch(/1\.m3u8$/);
	});

	it("leaves out the audio settings and codec for media without audio", async () => {
		ffmpegLib.ffprobe.mockResolvedValue({ streams: [{ codec_type: "video" }] });
		ffmpegWrites([one(30)]);
		const [result] = await encodeHls("in.mov", [r480], sinkAll);

		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args).not.toContain("-c:a");
		expect(args).not.toContain("-af");
		expect(result!.hasAudio).toBe(false);
		expect(result!.codecs).toBe("avc1.64002a");
	});

	it("throws when a playlist doesn't end where its output ends", async () => {
		ffmpegWrites([one(30), one(29, playlist([[2, 20, 10]], "10@0"))]);
		await expect(encodeHls("in.mov", [r480, r720], sinkAll)).rejects.toThrow(
			"720p playlist ends at byte 30, but ffmpeg wrote 29",
		);
	});

	it("fails every sink's stream when ffmpeg fails, so no partial file is stored", async () => {
		ffmpegWrites([one(30), one(30)], new Error("ffmpeg exited with code 1"));
		const sinkErrors: unknown[] = [];
		await expect(
			encodeHls("in.mov", [r480, r720], (index, body) =>
				collect(body).catch((error: unknown) => {
					sinkErrors[index] = error;
					throw error;
				}),
			),
		).rejects.toThrow("ffmpeg exited with code 1");
		expect(sinkErrors.map((error) => (error as Error).message)).toEqual([
			"ffmpeg exited with code 1",
			"ffmpeg exited with code 1",
		]);
	});

	it("closes a failed sink's pipe, so ffmpeg can't block on it", async () => {
		ffmpegLib.ffmpeg.mockImplementation((args: string[]) => {
			playlistDir = path.dirname(args.at(-1)!);
			const stream = new PassThrough();
			// ffmpeg ends with an error once its pipe is closed
			const done = new Promise<void>((_resolve, reject) =>
				stream.on("close", () => reject(new Error("ffmpeg exited with code 1"))),
			);
			return { stdout: new PassThrough(), outputs: [stream], done };
		});
		await expect(
			encodeHls("in.mov", [r480], () => Promise.reject(new Error("S3 down"))),
		).rejects.toThrow("S3 down");
		expect(
			(ffmpegLib.ffmpeg.mock.results[0]!.value as { outputs: PassThrough[] }).outputs[0]!.destroyed,
		).toBe(true);
	});

	it("propagates a failing ffprobe without starting ffmpeg", async () => {
		ffmpegLib.ffprobe.mockRejectedValue(new Error("ffprobe exited with code 1"));
		await expect(encodeHls("in.mov", [r480], sinkAll)).rejects.toThrow("ffprobe exited");
		expect(ffmpegLib.ffmpeg).not.toHaveBeenCalled();
	});
});
