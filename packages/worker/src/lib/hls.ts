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
 * Encodes `input` into a single fragmented MP4 that HLS plays through byte ranges. The media goes to
 * `sink` as a stream, only ffmpeg's playlist (a few KB) touches the disk. Both tracks start at exactly
 * 0 and keyframes sit every 2s, so renditions line up and frame indices map 1:1 to the source.
 */
export async function encodeHls(
	input: string,
	rendition: HlsRendition,
	sink: (body: Readable) => Promise<unknown>,
	onProgress?: (fraction: number) => void,
): Promise<HlsResult> {
	const { streams } = await ffprobe(input);
	const hasAudio = streams.some((stream) => stream.codec_type === "audio");
	const { width, height, videoBitRate, audioBitRate } = rendition;

	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hls-"));
	try {
		const playlistPath = path.join(dir, "index.m3u8");
		const proc = ffmpeg(
			[
				"-nostdin",
				"-i",
				input,
				"-map",
				"0:v:0",
				"-map",
				"0:a:0?",
				// drops source timecode tracks, which the mp4 segment muxer can't write
				"-map_metadata",
				"-1",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
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
				"-vf",
				`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
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
				"-hls_segment_filename",
				"pipe:1",
				playlistPath,
			],
			onProgress,
		);

		let bytes = 0;
		const counter = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				bytes += chunk.length;
				callback(null, chunk);
			},
		});
		// a failed ffmpeg must fail the sink too, so no partial file gets stored as complete
		proc.done.catch((error: Error) => counter.destroy(error));
		await Promise.all([pipeline(proc.stdout, counter), sink(counter), proc.done]);

		const hls = parseHlsPlaylist(await fs.readFile(playlistPath, "utf8"));
		const last = hls.segments.at(-1)!;
		if (last.offset + last.length !== bytes) {
			throw new Error(
				`Playlist ends at byte ${last.offset + last.length}, but ffmpeg wrote ${bytes}`,
			);
		}
		return {
			hls,
			bytes,
			codecs: hasAudio ? `${VIDEO_CODECS},${AUDIO_CODECS}` : VIDEO_CODECS,
			hasAudio,
		};
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
