// Exports uploaded in the browser instead of a plugin. There is no NLE timeline to snapshot, so the
// snapshot is estimated: from the form at first, then from ffprobe and the scene detection in the
// worker. Values the uploader set themselves are never replaced.
import * as v from "valibot";
import type { SceneScores } from "../types/SceneScores.ts";
import type { Clip, FrameRate, TimelineSnapshot } from "../types/TimelineSnapshot.ts";
import { formatTimecode, framesPerDay, parseTimecode } from "./timecode.ts";

// ─── Frame rates ────────────────────────────────────────────────────────────

/** The rates the upload form offers, in this order */
export const FRAME_RATE_OPTIONS = [
	{ label: "23.976", fpsNumerator: 24000, fpsDenominator: 1001, dropFrame: false },
	{ label: "24", fpsNumerator: 24, fpsDenominator: 1, dropFrame: false },
	{ label: "25", fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
	{ label: "29.97 DF", fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: true },
	{ label: "29.97 NDF", fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: false },
	{ label: "30", fpsNumerator: 30, fpsDenominator: 1, dropFrame: false },
	{ label: "50", fpsNumerator: 50, fpsDenominator: 1, dropFrame: false },
	{ label: "59.94 DF", fpsNumerator: 60000, fpsDenominator: 1001, dropFrame: true },
	{ label: "59.94 NDF", fpsNumerator: 60000, fpsDenominator: 1001, dropFrame: false },
	{ label: "60", fpsNumerator: 60, fpsDenominator: 1, dropFrame: false },
] as const satisfies readonly (FrameRate & { label: string })[];

const fps = (r: Pick<FrameRate, "fpsNumerator" | "fpsDenominator">) =>
	r.fpsNumerator / r.fpsDenominator;

/** Drop-frame only exists for 29.97 and 59.94 */
export const canDropFrame = (r: Pick<FrameRate, "fpsNumerator" | "fpsDenominator">) =>
	r.fpsDenominator === 1001 && (r.fpsNumerator === 30000 || r.fpsNumerator === 60000);

export const isFrameRateOption = (r: FrameRate) =>
	FRAME_RATE_OPTIONS.some(
		(o) =>
			o.fpsNumerator === r.fpsNumerator &&
			o.fpsDenominator === r.fpsDenominator &&
			o.dropFrame === r.dropFrame,
	);

export const frameRateLabel = (r: FrameRate) =>
	FRAME_RATE_OPTIONS.find(
		(o) =>
			o.fpsNumerator === r.fpsNumerator &&
			o.fpsDenominator === r.fpsDenominator &&
			o.dropFrame === r.dropFrame,
	)?.label ?? `${Math.round(fps(r) * 1000) / 1000}`;

/** Above this relative difference to the nearest standard rate, the measured rate is suspicious */
export const FRAME_RATE_TOLERANCE = 0.001;

/**
 * Nearest standard rate to a measured one, e.g. 23.998 → 24. 29.97 and 59.94 suggest drop-frame,
 * the timecode of the file (if it has one) says for sure. `variable` is set when the measured
 * rate is too far off any standard, typically phone videos with a variable frame rate.
 */
export function roundFrameRate(measured: number): { frameRate: FrameRate; variable: boolean } {
	const rates = FRAME_RATE_OPTIONS.filter((o) => !canDropFrame(o) || o.dropFrame);
	let best = rates[0]!;
	for (const rate of rates) {
		if (Math.abs(fps(rate) - measured) < Math.abs(fps(best) - measured)) best = rate;
	}
	const { fpsNumerator, fpsDenominator, dropFrame } = best;
	return {
		frameRate: { fpsNumerator, fpsDenominator, dropFrame },
		variable:
			!Number.isFinite(measured) ||
			Math.abs(measured - fps(best)) / fps(best) > FRAME_RATE_TOLERANCE,
	};
}

// ─── Cut detection ──────────────────────────────────────────────────────────

/** Score thresholds per sensitivity: a lower one finds more cuts */
export const CUT_LEVELS = { sensitive: 0.2, medium: 0.3, insensitive: 0.45 } as const;
export const CUT_LEVEL_LABELS = {
	sensitive: "Sensitive",
	medium: "Medium",
	insensitive: "Insensitive",
	none: "No cuts",
} as const;
/** "none": one clip for the whole video */
export type CutLevel = keyof typeof CUT_LEVELS | "none";
export const cutLevel = v.picklist(["sensitive", "medium", "insensitive", "none"]);
export const DEFAULT_CUT_LEVEL: CutLevel = "medium";

/** Lowest score the scene detection keeps; below every level's threshold */
export const SCENE_SCORE_FLOOR = 0.1;
/** Shorter shots are taken for a flash or a dissolve, not a cut */
export const MIN_SHOT_SECONDS = 0.5;

/**
 * Frames (from the start of the file) where a new shot begins, for the given level. A cut closer
 * than MIN_SHOT_SECONDS to the previous cut, the start or the end is dropped.
 */
export function cutFrames(
	scores: SceneScores["scores"],
	level: CutLevel,
	frameRate: FrameRate,
	durationFrameCount: number,
): number[] {
	if (level === "none") return [];
	const threshold = CUT_LEVELS[level];
	const minFrames = Math.max(1, Math.round(MIN_SHOT_SECONDS * fps(frameRate)));
	const cuts: number[] = [];
	let previous = 0;
	for (const [frame, score] of [...scores].sort((a, b) => a[0] - b[0])) {
		if (score < threshold) continue;
		if (frame - previous < minFrames || durationFrameCount - frame < minFrames) continue;
		cuts.push(frame);
		previous = frame;
	}
	return cuts;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

/** Fields of the form the uploader can change; changed ones are kept when the worker probes */
export const USER_SET_FIELDS = ["frameRate", "startFrameIndex"] as const;
export type UserSetField = (typeof USER_SET_FIELDS)[number];

export type WebUploadMetadata = {
	source: "web-upload";
	estimated: true;
	userSet: UserSetField[];
	cutLevel: CutLevel;
	fileName: string;
};

export const isWebUpload = (
	snapshot: Pick<TimelineSnapshot, "metadata"> | null | undefined,
): snapshot is TimelineSnapshot & { metadata: WebUploadMetadata } =>
	snapshot?.metadata?.["source"] === "web-upload";

/** The single media item: the uploaded file */
export const WEB_UPLOAD_MEDIA_ID = "upload";

function clipsFor(
	snapshot: Pick<TimelineSnapshot, "startFrameIndex" | "durationFrameCount">,
	cuts: number[],
	fileName: string,
): Clip[] {
	if (snapshot.durationFrameCount <= 0) return [];
	const bounds = [0, ...cuts, snapshot.durationFrameCount];
	return bounds.slice(0, -1).map((from, i) => ({
		id: `shot-${i + 1}`,
		// one clip without cuts: named like a clip in an NLE, after its file
		name: cuts.length > 0 ? `Shot ${i + 1} (estimated)` : fileName,
		mediaId: WEB_UPLOAD_MEDIA_ID,
		startFrameIndex: snapshot.startFrameIndex + from,
		durationFrameCount: bounds[i + 1]! - from,
		sourceStartFrameIndex: snapshot.startFrameIndex + from,
		speed: 1,
		metadata: {},
		color: null,
	}));
}

export type WebUploadTiming = {
	frameRate: FrameRate;
	startFrameIndex: number;
	/** 0 while unknown (MXF before probing) */
	durationFrameCount: number;
};

/** Preliminary snapshot from the upload form: one clip for the whole video, until the cuts are known */
export function webUploadSnapshot(a: {
	id: string;
	name: string;
	fileName: string;
	timing: WebUploadTiming;
	userSet: UserSetField[];
	cutLevel: CutLevel;
}): TimelineSnapshot & { metadata: WebUploadMetadata } {
	const metadata: WebUploadMetadata = {
		source: "web-upload",
		estimated: true,
		userSet: [...new Set(a.userSet)],
		cutLevel: a.cutLevel,
		fileName: a.fileName,
	};
	return {
		id: a.id,
		name: a.name,
		...a.timing,
		tracks: [
			{ id: "V1", type: "video", name: "Video 1", clips: clipsFor(a.timing, [], a.fileName) },
		],
		mediaItems: [
			{
				id: WEB_UPLOAD_MEDIA_ID,
				name: a.fileName,
				type: "video",
				filePath: a.fileName,
				frameRate: a.timing.frameRate,
				startTimecode: formatTimecode(a.timing.startFrameIndex, a.timing.frameRate),
				metadata: {},
			},
		],
		metadata,
	};
}

/** The snapshot with new timing; the clips start over as one, cuts are applied after. */
function withTiming(
	snapshot: TimelineSnapshot & { metadata: WebUploadMetadata },
	timing: WebUploadTiming,
): TimelineSnapshot & { metadata: WebUploadMetadata } {
	return webUploadSnapshot({
		id: snapshot.id,
		name: snapshot.name,
		fileName: snapshot.metadata.fileName,
		timing,
		userSet: snapshot.metadata.userSet,
		cutLevel: snapshot.metadata.cutLevel,
	});
}

/** What ffprobe found out about the original */
export type ProbedTiming = {
	/** Measured rate, before rounding to a standard one */
	fps: number | null;
	/** Start timecode of the file, ";" before the frames means drop-frame */
	timecode: string | null;
	frameCount: number | null;
	durationSeconds: number | null;
};

/**
 * Replaces the form's estimates with what the worker measured, except where the uploader set a
 * value. The duration always comes from the file. Clips start over as one, without cuts.
 */
export function applyProbe(
	snapshot: TimelineSnapshot & { metadata: WebUploadMetadata },
	probed: ProbedTiming,
): TimelineSnapshot & { metadata: WebUploadMetadata } {
	const userSet = new Set(snapshot.metadata.userSet);
	let frameRate = snapshot.frameRate;
	if (!userSet.has("frameRate") && probed.fps) {
		const rounded = roundFrameRate(probed.fps).frameRate;
		const dropFrame = probed.timecode
			? probed.timecode.includes(";")
			: rounded.fpsNumerator === frameRate.fpsNumerator &&
				  rounded.fpsDenominator === frameRate.fpsDenominator
				? frameRate.dropFrame
				: rounded.dropFrame;
		frameRate = { ...rounded, dropFrame: dropFrame && canDropFrame(rounded) };
	}

	let startFrameIndex = snapshot.startFrameIndex;
	if (!userSet.has("startFrameIndex") && probed.timecode) {
		try {
			startFrameIndex = parseTimecode(probed.timecode, frameRate);
		} catch {
			// a timecode that doesn't fit the rate (e.g. frame 29 at 25 fps): keep the estimate
		}
	}
	// a start the uploader set at another rate may not exist at this one
	if (startFrameIndex >= framesPerDay(frameRate)) startFrameIndex = 0;

	const durationFrameCount = probedFrameCount(probed, frameRate) ?? snapshot.durationFrameCount;

	return withTiming(snapshot, { frameRate, startFrameIndex, durationFrameCount });
}

const positive = (n: number | null) => (n !== null && n > 0 ? n : null);
const sameRate = (a: FrameRate, b: FrameRate) =>
	a.fpsNumerator === b.fpsNumerator && a.fpsDenominator === b.fpsDenominator;

/**
 * The length in frames of the timeline's rate. The file's frame count only is that when the
 * timeline runs at the file's own, constant rate: an uploader who chose 25 for a 24 fps file gets
 * a timeline at 25, and the video plays as many seconds as before, so it is seconds × 25.
 */
function probedFrameCount(probed: ProbedTiming, frameRate: FrameRate): number | null {
	const frames = positive(probed.frameCount);
	const seconds = positive(probed.durationSeconds);
	const fileFps = positive(probed.fps);
	// a variable rate is only the average: its frames don't last 1 / rate each
	const measured = fileFps !== null ? roundFrameRate(fileFps) : null;
	const atFileRate =
		measured !== null && !measured.variable && sameRate(measured.frameRate, frameRate);

	if (frames !== null && atFileRate) return frames;
	if (seconds !== null) return Math.max(1, Math.round(seconds * fps(frameRate)));
	// no length in seconds, but the frames last frames / fps of the file
	if (frames !== null && fileFps !== null) {
		return Math.max(1, Math.round((frames / fileFps) * fps(frameRate)));
	}
	// the file's rate is unknown too: its frame count is the best there is
	return frames;
}

/** Rebuilds the clips from the stored scene scores for `level`, and remembers the level. */
export function applyCuts(
	snapshot: TimelineSnapshot & { metadata: WebUploadMetadata },
	scores: SceneScores | null,
	level: CutLevel,
): TimelineSnapshot & { metadata: WebUploadMetadata } {
	const cuts = scores
		? cutFrames(scores.scores, level, snapshot.frameRate, snapshot.durationFrameCount)
		: [];
	const metadata = { ...snapshot.metadata, cutLevel: level };
	return {
		...snapshot,
		metadata,
		tracks: [
			{
				...(snapshot.tracks[0] ?? { id: "V1", type: "video", name: "Video 1" }),
				clips: clipsFor(snapshot, cuts, metadata.fileName),
			},
		],
	};
}
