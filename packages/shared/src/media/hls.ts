import * as v from "valibot";
import { hlsInfo, type HlsInfo } from "../types/HlsIndex.ts";

/**
 * Review proxies: the worker and the NLE plugins both encode them with `hlsArgs()`, so the server
 * accepts proxies from either. No Node imports here, plugin-core runs this in the browser and UXP.
 */

export interface Rendition {
	/** the box the video is fitted into, keeping its aspect ratio */
	width: number;
	height: number;
	/** video bits per second */
	bitRate: number;
}

const KBits = 1000;

/** Largest first. selectRenditions() drops those larger than the source, so 2160p is 4K-only. */
export const PROXY_RENDITIONS: readonly Rendition[] = [
	{ width: 3840, height: 2160, bitRate: 20_000 * KBits },
	{ width: 1920, height: 1080, bitRate: 8000 * KBits },
	{ width: 1280, height: 720, bitRate: 3500 * KBits },
	{ width: 854, height: 480, bitRate: 1200 * KBits },
];

export const PROXY_AUDIO = { codec: "aac", bitRate: 128_000 } as const;
export const PROXY_VIDEO_CODEC = "h264";

/**
 * H.264 level of a rendition: 4.2 covers up to 1080p60, larger boxes need 5.2 (up to 2160p60).
 * Fixed per box rather than per source, so the codecs string is known before encoding.
 */
export function h264Level({ width, height }: { width: number; height: number }) {
	return width > 2048 || height > 1088 ? "5.2" : "4.2";
}

// Fixed by the encoder settings in hlsArgs(): H.264 High (avc1.64), AAC-LC
export const AUDIO_CODECS = "mp4a.40.2";

/** RFC 6381 codec of a rendition's video, e.g. avc1.64002a for High@4.2 */
export function videoCodecs(rendition: { width: number; height: number }) {
	const level = Math.round(Number(h264Level(rendition)) * 10);
	return `avc1.6400${level.toString(16).padStart(2, "0")}`;
}

/** RFC 6381 codecs of a proxy, for the master playlist */
export function proxyCodecs(hasAudio: boolean, rendition: { width: number; height: number }) {
	const video = videoCodecs(rendition);
	return hasAudio ? `${video},${AUDIO_CODECS}` : video;
}

export function isProxyRendition(candidate: Rendition) {
	return PROXY_RENDITIONS.some(
		(r) =>
			r.width === candidate.width &&
			r.height === candidate.height &&
			r.bitRate === candidate.bitRate,
	);
}

/**
 * Size the player shows: ffmpeg rotates by the stream's rotation, so ±90° swaps width and height
 */
export function displaySize(video: { width: number; height: number; rotation?: number | null }) {
	const quarterTurns = Math.round((video.rotation ?? 0) / 90);
	return quarterTurns % 2 === 0
		? { width: video.width, height: video.height }
		: { width: video.height, height: video.width };
}

/**
 * The renditions worth encoding for a source of this display size: those that don't upscale it.
 * A source smaller than every rendition still gets the smallest one, encoded at its own size.
 */
export function selectRenditions<R extends Rendition = Rendition>(
	source: { width: number; height: number },
	renditions: readonly R[] = PROXY_RENDITIONS as readonly R[],
): R[] {
	const fitting = renditions.filter(
		(r) => Math.min(r.width / source.width, r.height / source.height) <= 1,
	);
	if (fitting.length > 0) return fitting;
	const smallest = [...renditions].sort((a, b) => a.width * a.height - b.width * b.height)[0];
	return smallest ? [smallest] : [];
}

export interface HlsOutput {
	/** where ffmpeg writes the fragmented MP4, a path or e.g. `pipe:3` */
	media: string;
	/** where ffmpeg writes the playlist, a path */
	playlist: string;
}

export interface HlsArgsOptions {
	input: string;
	renditions: readonly Rendition[];
	/** one per rendition, same order */
	outputs: readonly HlsOutput[];
	hasAudio: boolean;
	audioBitRate?: number;
	/** global options, e.g. `["-progress", "pipe:1"]` */
	globalArgs?: readonly string[];
}

/**
 * ffmpeg arguments that encode `input` into one fragmented MP4 per rendition, which HLS plays through
 * byte ranges. ffmpeg decodes the source once and splits it. Both tracks start at exactly 0 and
 * keyframes sit every 2s, so renditions line up and frame indices map 1:1 to the source.
 */
export function hlsArgs({
	input,
	renditions,
	outputs,
	hasAudio,
	audioBitRate = PROXY_AUDIO.bitRate,
	globalArgs = [],
}: HlsArgsOptions): string[] {
	if (renditions.length === 0) throw new Error("hlsArgs needs at least one rendition");
	if (outputs.length !== renditions.length) {
		throw new Error(`hlsArgs got ${renditions.length} renditions but ${outputs.length} outputs`);
	}
	// min(): never upscale, e.g. the smallest rendition of a source smaller than it
	const scale = ({ width, height }: Rendition) =>
		`scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease,` +
		`pad=ceil(iw/2)*2:ceil(ih/2)*2`;
	const graph =
		`[0:v:0]split=${renditions.length}${renditions.map((_, i) => `[s${i}]`).join("")};` +
		renditions.map((r, i) => `[s${i}]${scale(r)}[v${i}]`).join(";");

	const outputArgs = (rendition: Rendition, i: number) => [
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
		h264Level(rendition),
		"-pix_fmt",
		"yuv420p",
		// B-frames delay the first video frame by 2 frames, which the HLS muxer can't compensate
		"-bf",
		"0",
		// capped VBR: averages bitRate, peaks stay predictable for adaptive streaming
		"-b:v",
		`${rendition.bitRate}`,
		"-maxrate",
		`${Math.round(rendition.bitRate * 1.5)}`,
		"-bufsize",
		`${rendition.bitRate * 2}`,
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
		outputs[i]!.media,
		outputs[i]!.playlist,
	];

	return [
		...globalArgs,
		"-nostdin",
		"-i",
		input,
		"-filter_complex",
		graph,
		...renditions.flatMap(outputArgs),
	];
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

/** Throws unless the byte ranges end exactly where the media file ends */
export function checkHlsSize(hls: HlsInfo, bytes: number) {
	const last = hls.segments.at(-1);
	const end = last ? last.offset + last.length : hls.init.offset + hls.init.length;
	if (end !== bytes) {
		throw new Error(`Playlist ends at byte ${end}, but the media file has ${bytes}`);
	}
}

/** Total length of the segments in seconds */
export function hlsDuration(hls: HlsInfo) {
	return hls.segments.reduce((sum, segment) => sum + segment.duration, 0);
}
