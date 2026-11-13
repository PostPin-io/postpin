// Checks a video in the browser before it is uploaded, and estimates what the upload form
// prefills: length, resolution, frame rate and start timecode. mediabunny only reads the parts of
// the file it needs (box headers, sample tables), so this stays fast for files of many GB.
import { canDropFrame, roundFrameRate } from "@postpin-io/shared/logic/web-upload";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import { readQuickTimeTimecode } from "./quicktime-timecode.ts";

export const UPLOAD_EXTENSIONS = [".mp4", ".mov", ".webm", ".mxf"] as const;
/** mediabunny's names of the video codecs we accept (MPEG-2 only comes in MXF, read later) */
const CODECS: Record<string, string> = {
	avc: "H.264",
	hevc: "HEVC",
	prores: "ProRes",
	vp9: "VP9",
};
export const UPLOAD_FORMATS_TEXT = "MP4, MOV, WebM or MXF with H.264, HEVC, ProRes, VP9 or MPEG-2";

/** Enough frames for a stable frame rate, without reading through a long file */
const FRAME_RATE_SAMPLE = 300;

export type Inspection =
	| {
			kind: "video";
			container: "mp4" | "mov" | "webm";
			codec: string;
			width: number;
			height: number;
			durationSeconds: number;
			/** Rounded to the nearest standard rate */
			frameRate: FrameRate;
			measuredFps: number;
			/** The measured rate is far off any standard one, e.g. a phone's variable frame rate */
			variableFrameRate: boolean;
			/** From the file's timecode track; null if it has none */
			startTimecode: string | null;
	  }
	/** MXF: nothing can be read in the browser, the worker reads it after the upload */
	| { kind: "later"; container: "mxf" }
	| { kind: "invalid"; message: string };

const extensionOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

export async function inspectFile(file: File): Promise<Inspection> {
	const extension = extensionOf(file.name);
	if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
		return {
			kind: "invalid",
			message: `Unsupported file type. Please choose ${UPLOAD_FORMATS_TEXT}.`,
		};
	}
	if (extension === ".mxf") return { kind: "later", container: "mxf" };

	// loaded on first use, so it isn't part of every page
	const { ALL_FORMATS, BlobSource, Input, MP4, QTFF, WEBM } = await import("mediabunny");
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const format = await input.getFormat().catch(() => null);
		const container =
			format === MP4 ? "mp4" : format === QTFF ? "mov" : format === WEBM ? "webm" : null;
		if (!container) {
			return { kind: "invalid", message: "This file can't be read. Is it a video?" };
		}

		const track = await input.getPrimaryVideoTrack();
		if (!track) return { kind: "invalid", message: "This file has no video." };
		const codec = track.codec ? CODECS[track.codec] : undefined;
		if (!codec) {
			return {
				kind: "invalid",
				message: `The video codec ${track.codec ?? "of this file"} isn't supported. Please use H.264, HEVC, ProRes or VP9.`,
			};
		}

		const [stats, durationSeconds, timecode] = await Promise.all([
			track.computePacketStats(FRAME_RATE_SAMPLE),
			input
				.getDurationFromMetadata()
				.then((d) => d ?? input.computeDuration())
				.catch(() => input.computeDuration()),
			container === "webm" ? null : readQuickTimeTimecode(file).catch(() => null),
		]);

		const measuredFps = stats.averagePacketRate;
		const rounded = roundFrameRate(measuredFps);
		const frameRate = { ...rounded.frameRate };
		// the timecode track knows for sure whether it counts drop-frame
		if (timecode && canDropFrame(frameRate)) frameRate.dropFrame = timecode.dropFrame;

		return {
			kind: "video",
			container,
			codec,
			width: track.displayWidth,
			height: track.displayHeight,
			durationSeconds,
			frameRate,
			measuredFps,
			variableFrameRate: rounded.variable,
			startTimecode: timecode?.timecode ?? null,
		};
	} catch (error) {
		console.error("Inspecting the file failed", error);
		return { kind: "invalid", message: "This file can't be read. Is it a video?" };
	} finally {
		input.dispose();
	}
}
