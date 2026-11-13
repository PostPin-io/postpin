import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { hlsArgs } from "@postpin-io/shared/media/hls";

const ffmpegLib = vi.hoisted(() => ({ ffmpeg: vi.fn(), ffprobe: vi.fn() }));
vi.mock("../../src/lib/ffmpeg.ts", () => ffmpegLib);

import { encodeHls } from "../../src/lib/hls.ts";

// the argument details are tested with hlsArgs() in shared
const playlist = (segments: [duration: number, length: number, offset: number][], init = "800@0") =>
	[
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="pipe:3",BYTERANGE="${init}"`,
		...segments.flatMap(([d, l, o]) => [
			`#EXTINF:${d.toFixed(6)},`,
			`#EXT-X-BYTERANGE:${l}@${o}`,
			"pipe:3",
		]),
		"#EXT-X-ENDLIST",
		"",
	].join("\n");

describe("encodeHls", () => {
	const r480 = { width: 854, height: 480, bitRate: 1_000_000 };
	const r720 = { width: 1280, height: 720, bitRate: 3_500_000 };
	const options = { input: "in.mov", renditions: [r480, r720], hasAudio: true };
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
		ffmpegLib.ffmpeg.mockReset();
		ffmpegLib.ffprobe.mockReset();
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
			options,
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

	it("runs ffmpeg with the shared hlsArgs, one pipe per output from fd 3 on, without probing", async () => {
		ffmpegWrites([one(30), one(30)]);
		await encodeHls({ ...options, audioBitRate: 96_000 }, sinkAll);

		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		const playlists = [args[args.indexOf("pipe:3") + 1]!, args[args.indexOf("pipe:4") + 1]!];
		expect(playlists.map((p) => path.basename(p))).toEqual(["0.m3u8", "1.m3u8"]);
		expect(args).toEqual(
			hlsArgs({
				...options,
				audioBitRate: 96_000,
				outputs: [
					{ media: "pipe:3", playlist: playlists[0]! },
					{ media: "pipe:4", playlist: playlists[1]! },
				],
			}),
		);
		expect(ffmpegLib.ffprobe).not.toHaveBeenCalled();
	});

	it("reports codecs without AAC for media without audio", async () => {
		ffmpegWrites([one(30)]);
		const [result] = await encodeHls({ ...options, renditions: [r480], hasAudio: false }, sinkAll);

		const args: string[] = ffmpegLib.ffmpeg.mock.calls[0]![0];
		expect(args).not.toContain("-c:a");
		expect(result!.hasAudio).toBe(false);
		expect(result!.codecs).toBe("avc1.64002a");
	});

	it("throws when a playlist doesn't end where its output ends", async () => {
		ffmpegWrites([one(30), one(29, playlist([[2, 20, 10]], "10@0"))]);
		await expect(encodeHls(options, sinkAll)).rejects.toThrow(
			"720p: Playlist ends at byte 30, but the media file has 29",
		);
	});

	it("fails every sink's stream when ffmpeg fails, so no partial file is stored", async () => {
		ffmpegWrites([one(30), one(30)], new Error("ffmpeg exited with code 1"));
		const sinkErrors: unknown[] = [];
		await expect(
			encodeHls(options, (index, body) =>
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
			encodeHls({ ...options, renditions: [r480] }, () => Promise.reject(new Error("S3 down"))),
		).rejects.toThrow("S3 down");
		const run = ffmpegLib.ffmpeg.mock.results[0]!.value as { outputs: PassThrough[] };
		expect(run.outputs[0]!.destroyed).toBe(true);
	});
});
