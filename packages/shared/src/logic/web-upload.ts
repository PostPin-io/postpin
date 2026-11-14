// Exports uploaded in the browser instead of a plugin. There is no NLE timeline to snapshot, so the
// snapshot is estimated: from the form at first, then from ffprobe and the scene detection in the
// worker. Values the uploader set themselves are never replaced.
import * as v from "valibot";
import type { SceneScores } from "../types/SceneScores.ts";
import {
	CutListError,
	cutListMarkers,
	cutListTracks,
	hasVideoClips,
	type CutList,
	type CutListMarkerAt,
} from "./cut-list.ts";
import { markerCategory } from "./marker-categories.ts";
import type { Clip, FrameRate, TimelineSnapshot, Track } from "../types/TimelineSnapshot.ts";
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
	/** The tracks come from the cut list uploaded with the video, not from the cut detection */
	cutsFrom?: CutList["format"];
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

// ─── Cut list ───────────────────────────────────────────────────────────────

/** A marker of the cut list, placed on the video: what becomes a PostPin marker */
export type PlacedMarker = {
	/** Its place in the list, for an id that stays the same when the job runs again */
	index: number;
	name: string;
	description: string | null;
	/** Absolute timeline frame, like the snapshot's */
	frame: number;
	/** Length in frames, 0 = point marker */
	duration: number;
	category: { name: string; color: string };
};

/**
 * The snapshot with the tracks of the cut list uploaded with the video (see cut-list.ts), at the
 * frame rate the timeline has after probing, so its shots are the editing software's, and the
 * list's markers placed on the video.
 *
 * Record timecodes are absolute like the timeline's start; a list whose first video clip doesn't
 * start inside the video (e.g. a file without a timecode, starting at 00:00:00:00, and a list at
 * 01:00:00:00) is moved to the start of the video. A list with only markers is moved by whole
 * hours instead, since a marker rarely sits at the very start. Everything is cut to the video's
 * length, clips overlapping on one track only fill what is left, and markers outside the video are
 * left out. A list without video clips leaves the tracks as they are.
 *
 * Throws a CutListError when a timecode doesn't fit the frame rate, or when nothing of the list is
 * inside the video.
 */
/** The timing of a snapshot: where the cut list's timecodes are placed */
type Timing = Pick<TimelineSnapshot, "startFrameIndex" | "durationFrameCount" | "frameRate">;

/**
 * How far the list is moved to sit on the video. Record timecodes are absolute like the timeline's
 * start; a list whose first video clip doesn't start inside the video (e.g. a file without a
 * timecode, starting at 00:00:00:00, and a list at 01:00:00:00) is moved to the start of the video.
 * A list with only markers is moved by whole hours instead, since a marker rarely sits at the
 * very start.
 */
function cutListOffset(timing: Timing, tracks: Track[], markers: CutListMarkerAt[]): number {
	const start = timing.startFrameIndex;
	const end = start + timing.durationFrameCount;
	const inside = (frame: number) => frame >= start && frame < end;
	const firstVideo = Math.min(
		...tracks
			.filter((t) => t.type === "video")
			.flatMap((t) => t.clips.map((c) => c.startFrameIndex)),
	);
	if (Number.isFinite(firstVideo)) return inside(firstVideo) ? 0 : start - firstVideo;
	const firstMarker = Math.min(...markers.map((m) => m.frame));
	if (!Number.isFinite(firstMarker) || inside(firstMarker)) return 0;
	const hour = Math.round(3600 * fps(timing.frameRate));
	return start - Math.floor(firstMarker / hour) * hour;
}

function placeMarkers(timing: Timing, markers: CutListMarkerAt[], offset: number): PlacedMarker[] {
	const start = timing.startFrameIndex;
	const end = start + timing.durationFrameCount;
	return markers.flatMap(({ index, frame, duration, marker }) => {
		const at = frame + offset;
		if (at < start || at >= end) return [];
		return [
			{
				index,
				name: marker.name,
				description: marker.note,
				frame: at,
				// a range marker ends with the video at the latest
				duration: Math.min(duration, end - at),
				category: markerCategory(marker.host, marker.label),
			},
		];
	});
}

/**
 * The cut list's markers placed on any timeline, a plugin export's too, the same way applyCutList
 * places them (the list's clips, if it has any, decide how far it is moved). Throws a CutListError
 * when a timecode doesn't fit the frame rate, or when no marker is inside the timeline.
 */
export function placeCutListMarkers(timing: Timing, list: CutList): PlacedMarker[] {
	const tracks = cutListTracks(list, timing.frameRate, "placing");
	const listMarkers = cutListMarkers(list, timing.frameRate);
	const markers = placeMarkers(timing, listMarkers, cutListOffset(timing, tracks, listMarkers));
	if (markers.length === 0) throw new CutListError("No marker of the list is inside the timeline");
	return markers;
}

export function applyCutList(
	snapshot: TimelineSnapshot & { metadata: WebUploadMetadata },
	list: CutList,
): { snapshot: TimelineSnapshot & { metadata: WebUploadMetadata }; markers: PlacedMarker[] } {
	const start = snapshot.startFrameIndex;
	const end = start + snapshot.durationFrameCount;
	const tracks = cutListTracks(list, snapshot.frameRate, WEB_UPLOAD_MEDIA_ID);
	const listMarkers = cutListMarkers(list, snapshot.frameRate);
	const offset = cutListOffset(snapshot, tracks, listMarkers);

	const fitted: Track[] = [];
	for (const track of tracks) {
		const clips: Clip[] = [];
		let covered = start;
		for (const clip of [...track.clips].sort((a, b) => a.startFrameIndex - b.startFrameIndex)) {
			const from = Math.max(clip.startFrameIndex + offset, covered);
			const to = Math.min(clip.startFrameIndex + offset + clip.durationFrameCount, end);
			if (to <= from) continue;
			clips.push({
				...clip,
				startFrameIndex: from,
				durationFrameCount: to - from,
				sourceStartFrameIndex: from,
			});
			covered = to;
		}
		if (clips.length > 0) fitted.push({ ...track, clips });
	}
	const markers = placeMarkers(snapshot, listMarkers, offset);

	const hasClips = fitted.some((t) => t.type === "video");
	if (hasVideoClips(list) && !hasClips) {
		throw new CutListError("No video clip of the cut list is inside the video");
	}
	if (!hasClips && markers.length === 0) {
		throw new CutListError("No marker of the list is inside the video");
	}
	return {
		snapshot: hasClips
			? { ...snapshot, tracks: fitted, metadata: { ...snapshot.metadata, cutsFrom: list.format } }
			: snapshot,
		markers,
	};
}
