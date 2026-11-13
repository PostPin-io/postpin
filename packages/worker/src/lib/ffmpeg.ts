import * as childProcess from "node:child_process";
import * as v from "valibot";
import type { Readable } from "node:stream";

const num = v.pipe(v.string(), v.toNumber());
const fraction = v.pipe(
	v.string(),
	v.transform((s) => {
		const [n, d] = s.split("/").map(Number);
		return d ? n! / d : 0;
	}),
);

const base = v.object({
	index: v.number(),
	codec_name: v.optional(v.string()),
	duration: v.optional(num),
	bit_rate: v.optional(num),
	tags: v.optional(v.record(v.string(), v.string())),
});

const VideoStream = v.object({
	...base.entries,
	codec_type: v.literal("video"),
	width: v.number(),
	height: v.number(),
	pix_fmt: v.optional(v.string()),
	/** e.g. "High"; verifyProxies checks it */
	profile: v.optional(v.string()),
	/** H.264 level times ten, e.g. 42 for 4.2 */
	level: v.optional(v.number()),
	avg_frame_rate: fraction,
	r_frame_rate: v.optional(fraction),
	nb_frames: v.optional(num),
	side_data_list: v.optional(v.array(v.looseObject({ rotation: v.optional(v.number()) }))),
});

export type VideoStream = v.InferOutput<typeof VideoStream>;

const AudioStream = v.object({
	...base.entries,
	codec_type: v.literal("audio"),
	sample_rate: num,
	channels: v.number(),
});

const OtherStream = v.looseObject({
	...base.entries,
	codec_type: v.picklist(["subtitle", "data", "attachment"]),
});

export const ProbeResult = v.object({
	streams: v.array(v.variant("codec_type", [VideoStream, AudioStream, OtherStream])),
	format: v.object({
		format_name: v.string(),
		duration: v.optional(num),
		size: v.optional(num),
		bit_rate: v.optional(num),
		tags: v.optional(v.record(v.string(), v.string())),
	}),
});
export type ProbeResult = v.InferOutput<typeof ProbeResult>;

export async function ffprobe(pathOrUrl: string): Promise<ProbeResult> {
	return new Promise((resolve, reject) => {
		const ffprobeProcess = childProcess.spawn("ffprobe", [
			"-v",
			"error",
			"-show_format",
			"-show_streams",
			"-of",
			"json",
			pathOrUrl,
		]);
		ffprobeProcess.on("error", (err) =>
			reject(new Error(`ffprobe could not be started: ${err.message}`)),
		);

		let output = "";
		ffprobeProcess.stdout.on("data", (data) => {
			output += data.toString();
		});

		ffprobeProcess.stderr.on("data", (data) => {
			console.error(`ffprobe error: ${data}`);
		});

		ffprobeProcess.on("close", (code) => {
			if (code === 0) {
				try {
					const parsedOutput: unknown = JSON.parse(output);
					const validatedOutput = v.parse(ProbeResult, parsedOutput);
					resolve(validatedOutput);
				} catch (error) {
					reject(new Error(`Failed to parse ffprobe output: ${error}`));
				}
			} else {
				reject(new Error(`ffprobe exited with code ${code}`));
			}
		});
	});
}

function parseTimestamp(timestamp: string) {
	const [hours = 0, minutes = 0, seconds = 0] = timestamp.split(":").map(Number);
	return hours * 3600 + minutes * 60 + seconds;
}

export function ffmpeg(args: string[], onProgress?: (fraction: number) => void, outputs = 0) {
	// data goes to stdout, progress goes to stderr
	const proc = childProcess.spawn("ffmpeg", args, {
		stdio: ["ignore", "pipe", "pipe", ...Array<"pipe">(outputs).fill("pipe")],
	});

	let duration = 0;
	proc.stderr!.on("data", (data: Buffer) => {
		const text = data.toString();
		console.log(text);
		const durationMatch = text.match(/Duration: (\d+:\d+:[\d.]+)/);
		if (durationMatch) duration = parseTimestamp(durationMatch[1]!);
		const timeMatch = text.match(/time=(\d+:\d+:[\d.]+)/);
		if (timeMatch && duration > 0) {
			onProgress?.(Math.min(parseTimestamp(timeMatch[1]!) / duration, 1));
		}
	});

	const done = new Promise<void>((resolve, reject) => {
		proc.on("error", reject);
		proc.on("close", (code) =>
			code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)),
		);
	});

	return { stdout: proc.stdout as Readable, outputs: proc.stdio.slice(3) as Readable[], done };
}

/**
 * Start timecode of a probed file: QuickTime keeps it in a tmcd data stream, MXF and MP4 in the
 * format or video stream tags. null if the file has none.
 */
export function probedTimecode(probe: ProbeResult): string | null {
	const video = probe.streams.find((s) => s.codec_type === "video");
	const candidates = [video?.tags, ...probe.streams.map((s) => s.tags), probe.format.tags];
	for (const tags of candidates) {
		const timecode = tags?.["timecode"];
		if (timecode && /^\d{2}:\d{2}:\d{2}[:;.]\d{2}$/.test(timecode))
			return timecode.replace(".", ":");
	}
	return null;
}
