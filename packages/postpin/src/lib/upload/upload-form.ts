// The upload form's logic, apart from its markup (UploadModal.svelte)
import type { UploadForm } from "#lib/components/exports/upload.remote.ts";
import { formatByteSize } from "@postpin-io/shared/logic/bytes";
import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
import {
	FRAME_RATE_OPTIONS,
	frameRateLabel,
	type CutLevel,
	type UserSetField,
} from "@postpin-io/shared/logic/web-upload";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import type { Inspection } from "./inspect-file.ts";

/** "Trailer_v3.final.mov" → "Trailer_v3.final" */
export const defaultExportName = (fileName: string) =>
	(fileName.lastIndexOf(".") > 0 ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName).slice(
		0,
		100,
	);

export type UploadLimits = { maxFileSize: bigint | null; available: bigint | null };

/** Why a file of `size` bytes can't be uploaded, or null if it can */
export function sizeProblem(size: number, limits: UploadLimits | undefined): string | null {
	if (!limits) return null;
	if (limits.maxFileSize !== null && BigInt(size) > limits.maxFileSize) {
		return `The file is too large: ${formatByteSize(size)}, at most ${formatByteSize(limits.maxFileSize)} per upload.`;
	}
	if (limits.available !== null && BigInt(size) > limits.available) {
		return limits.available === 0n
			? "Your storage is full. Delete exports or ask an admin for more space."
			: `Not enough storage left: the file needs ${formatByteSize(size)}, ${formatByteSize(limits.available)} are free.`;
	}
	return null;
}

export const frameRateByLabel = (label: string): FrameRate | null => {
	const option = FRAME_RATE_OPTIONS.find((o) => o.label === label);
	return option
		? {
				fpsNumerator: option.fpsNumerator,
				fpsDenominator: option.fpsDenominator,
				dropFrame: option.dropFrame,
			}
		: null;
};

/** The file's timecode written for `rate`: ";" before the frames for drop-frame */
export function timecodeFor(timecode: string, rate: FrameRate): string {
	try {
		return formatTimecode(parseTimecode(timecode, rate), rate);
	} catch {
		return timecode;
	}
}

/** The start frame for a typed timecode, or an error to show */
export function parseStart(
	timecode: string,
	rate: FrameRate,
): { frame: number } | { error: string } {
	try {
		return { frame: parseTimecode(timecode.trim(), rate) };
	} catch {
		const frames = Math.round(rate.fpsNumerator / rate.fpsDenominator);
		return { error: `Use hh:mm:ss:ff, frames from 00 to ${String(frames - 1).padStart(2, "0")}` };
	}
}

/** What the form starts with for an inspected file */
export function initialValues(inspection: Inspection) {
	if (inspection.kind !== "video") return { frameRate: "", startTimecode: "" };
	const label = frameRateLabel(inspection.frameRate);
	return {
		frameRate: label,
		startTimecode: inspection.startTimecode
			? timecodeFor(inspection.startTimecode, inspection.frameRate)
			: formatTimecode(0, inspection.frameRate),
	};
}

/**
 * The form values sent with completeWebUpload. Empty fields (MXF) are null: the worker fills
 * them in. `changed` are the fields the user edited; the worker keeps those.
 */
export function buildUploadForm(a: {
	fileName: string;
	inspection: Inspection;
	frameRateLabel: string;
	startTimecode: string;
	changed: UserSetField[];
	cutLevel: CutLevel;
}): UploadForm | { error: string } {
	const frameRate = frameRateByLabel(a.frameRateLabel);
	let startFrameIndex: number | null = null;
	if (a.startTimecode.trim()) {
		if (!frameRate) return { error: "Choose the frame rate for the start timecode" };
		const start = parseStart(a.startTimecode, frameRate);
		if ("error" in start) return start;
		startFrameIndex = start.frame;
	}
	const durationFrameCount =
		a.inspection.kind === "video" && frameRate
			? Math.max(
					1,
					Math.round(
						a.inspection.durationSeconds * (frameRate.fpsNumerator / frameRate.fpsDenominator),
					),
				)
			: null;
	return {
		fileName: a.fileName,
		frameRate,
		startFrameIndex,
		durationFrameCount,
		userSet: a.changed,
		cutLevel: a.cutLevel,
	};
}

export function formatDuration(seconds: number) {
	const s = Math.round(seconds);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${Math.floor(s / 3600) > 0 ? `${Math.floor(s / 3600)}:` : ""}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
