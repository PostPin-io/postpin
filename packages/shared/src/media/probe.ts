import type { Rendition } from "./hls.ts";

/** ffprobe arguments for probe(): streams and format as JSON */
export function ffprobeArgs(input: string): string[] {
	return ["-v", "error", "-show_streams", "-show_format", "-of", "json", input];
}

export interface ProbedMedia {
	width: number;
	height: number;
	/** degrees from the display matrix, null without */
	rotation: number | null;
	hasAudio: boolean;
	/** seconds, null when the container doesn't say */
	duration: number | null;
}

/** Reads ffprobe's JSON; throws without a video stream */
export function parseProbe(json: string): ProbedMedia {
	const { streams = [], format = {} } = JSON.parse(json) as {
		streams?: {
			codec_type?: string;
			width?: number;
			height?: number;
			side_data_list?: { rotation?: number }[];
		}[];
		format?: { duration?: string };
	};
	const video = streams.find((s) => s.codec_type === "video");
	if (!video?.width || !video.height) throw new Error("The file has no video stream");
	const duration = Number(format.duration);
	return {
		width: video.width,
		height: video.height,
		rotation: video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? null,
		hasAudio: streams.some((s) => s.codec_type === "audio"),
		duration: Number.isFinite(duration) && duration > 0 ? duration : null,
	};
}

/** Global args so ffmpeg writes machine-readable progress to stdout and keeps stderr for errors */
export const PROGRESS_ARGS = ["-progress", "pipe:1", "-nostats", "-v", "error"];

/**
 * Reads the progress blocks ffmpeg writes with PROGRESS_ARGS ("out_time_us=…" lines). Feed it every
 * stdout chunk; it calls `onFraction` with 0..1 and keeps incomplete lines for the next chunk.
 */
export function progressReader(duration: number | null, onFraction: (fraction: number) => void) {
	let pending = "";
	return (chunk: string) => {
		pending += chunk;
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) {
			const match = /^out_time_us=(\d+)/.exec(line);
			if (match && duration) onFraction(Math.min(Number(match[1]) / 1e6 / duration, 1));
		}
	};
}
