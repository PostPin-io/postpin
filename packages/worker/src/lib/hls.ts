import fs from "fs/promises";
import os from "os";
import path from "path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as v from "valibot";
import { hlsInfo, type HlsInfo } from "@postpin-io/shared/types/HlsIndex";
import { ffmpeg, ffprobe } from "./ffmpeg.ts";

export interface HlsRendition {
	width: number;
	height: number;
	videoBitRate: number;
	audioBitRate: number;
}

export interface HlsResult {
	hls: HlsInfo;
	/** total size of the media file in bytes */
	bytes: number;
	/** RFC 6381 codecs for the master playlist */
	codecs: string;
	hasAudio: boolean;
}

// Fixed by the encoder settings below: H.264 High@4.2, AAC-LC
const VIDEO_CODECS = "avc1.64002a";
const AUDIO_CODECS = "mp4a.40.2";

/**
 * Encodes `input` into one fragmented MP4 per rendition that HLS plays through byte ranges. ffmpeg
 * decodes the source once and splits it into all renditions. Each media file goes to `sink` as a
 * stream, only ffmpeg's playlists (a few KB each) touch the disk. Both tracks start at exactly 0 and
 * keyframes sit every 2s, so renditions line up and frame indices map 1:1 to the source.
 * Results come back in the order of `renditions`.
 */
export async function encodeHls(
	input: string,
	renditions: HlsRendition[],
	sink: (index: number, body: Readable) => Promise<unknown>,
	onProgress?: (fraction: number) => void,
): Promise<HlsResult[]> {
	const { streams } = await ffprobe(input);
	const hasAudio = streams.some((stream) => stream.codec_type === "audio");

	const pad = "force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";
	const graph =
		`[0:v:0]split=${renditions.length}${renditions.map((_, i) => `[s${i}]`).join("")};` +
		renditions
			.map(({ width, height }, i) => `[s${i}]scale=${width}:${height}:${pad}[v${i}]`)
			.join(";");

	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hls-"));
	const playlistPath = (i: number) => path.join(dir, `${i}.m3u8`);
	try {
		const outputArgs = ({ videoBitRate, audioBitRate }: HlsRendition, i: number) => [
			"-map",
			`[v${i}]`,
			"-map",
			"0:a:0?",
			// drops source timecode tracks, which the mp4 segment muxer can't write
			"-map_metadata",
			"-1",
			"-c:v",
			"libx264",
			"-preset",
			"faster",
			"-profile:v",
			"high",
			"-level:v",
			"4.2",
			"-pix_fmt",
			"yuv420p",
			// B-frames delay the first video frame by 2 frames, which the HLS muxer can't compensate
			"-bf",
			"0",
			"-b:v",
			`${videoBitRate}`,
			"-maxrate",
			`${Math.round(videoBitRate * 1.5)}`,
			"-bufsize",
			`${videoBitRate * 2}`,
			// a keyframe exactly every 2s and nowhere else, so segments line up across renditions
			"-force_key_frames",
			"expr:gte(t,n_forced*2)",
			"-sc_threshold",
			"0",
			...(hasAudio
				? [
						// shift audio by the AAC encoder's 1024 priming samples so audio and video both start at 0
						"-af",
						"atrim=start_sample=1024,asetpts=PTS-STARTPTS+1024/SR/TB",
						"-c:a",
						"aac",
						"-b:a",
						`${audioBitRate}`,
						"-ac",
						"2",
					]
				: []),
			"-f",
			"hls",
			"-hls_segment_type",
			"fmp4",
			"-hls_flags",
			"single_file",
			"-hls_time",
			"2",
			"-hls_playlist_type",
			"vod",
			// fd 3, 4, ...: ffmpeg() opens one extra pipe per output
			"-hls_segment_filename",
			`pipe:${3 + i}`,
			playlistPath(i),
		];
		const proc = ffmpeg(
			["-nostdin", "-i", input, "-filter_complex", graph, ...renditions.flatMap(outputArgs)],
			onProgress,
			renditions.length,
		);

		const bytes = renditions.map(() => 0);
		// all sinks run at once: ffmpeg blocks as soon as any one pipe is full
		const uploads = proc.outputs.map((output, i) => {
			const counter = new Transform({
				transform(chunk: Buffer, _encoding, callback) {
					bytes[i]! += chunk.length;
					callback(null, chunk);
				},
			});
			// a failed ffmpeg must fail the sinks too, so no partial file gets stored as complete
			proc.done.catch((error: Error) => counter.destroy(error));
			return Promise.all([
				pipeline(output, counter),
				// a failed sink closes its pipe, so ffmpeg ends instead of blocking on it forever
				sink(i, counter).catch((error: Error) => {
					counter.destroy(error);
					throw error;
				}),
			]);
		});
		await Promise.all([...uploads, proc.done]);

		const codecs = hasAudio ? `${VIDEO_CODECS},${AUDIO_CODECS}` : VIDEO_CODECS;
		return await Promise.all(
			renditions.map(async ({ height }, i) => {
				const hls = parseHlsPlaylist(await fs.readFile(playlistPath(i), "utf8"));
				const last = hls.segments.at(-1)!;
				if (last.offset + last.length !== bytes[i]) {
					throw new Error(
						`${height}p playlist ends at byte ${last.offset + last.length}, but ffmpeg wrote ${bytes[i]}`,
					);
				}
				return { hls, bytes: bytes[i]!, codecs, hasAudio };
			}),
		);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

/** Reads the byte ranges out of a playlist written by ffmpeg's HLS muxer with `single_file` */
export function parseHlsPlaylist(playlist: string): HlsInfo {
	const init = playlist.match(/#EXT-X-MAP:.*BYTERANGE="(\d+)@(\d+)"/);
	const segments = [...playlist.matchAll(/#EXTINF:([\d.]+),\s*#EXT-X-BYTERANGE:(\d+)@(\d+)/g)].map(
		([, duration, length, offset]) => ({
			duration: Number(duration),
			length: Number(length),
			offset: Number(offset),
		}),
	);
	if (!init || segments.length === 0) throw new Error("ffmpeg playlist has no byte ranges");
	return v.parse(hlsInfo, { init: { length: Number(init[1]), offset: Number(init[2]) }, segments });
}
