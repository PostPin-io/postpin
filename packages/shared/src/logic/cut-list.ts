// The tracks and markers of the editing software's timeline, uploaded next to a web upload: read in
// the browser from a CMX3600 EDL (edl.ts) or an FCPXML (fcpxml.ts), so the server only gets this
// small, checked form. The worker turns it into the snapshot's tracks and PostPin markers once it
// knows the video's frame rate.
import * as v from "valibot";
import type { Clip, FrameRate, Track } from "../types/TimelineSnapshot.ts";
import { parseTimecode } from "./timecode.ts";

/** Why a cut list can't be read or doesn't fit the video; shown to the user as it is */
export class CutListError extends Error {}

/**
 * Most the server takes: below the request body limit of SvelteKit (512 KB by default), and some
 * 4000 clips, far more than even a long programme has.
 */
export const CUT_LIST_MAX_BYTES = 400 * 1024;
export const CUT_LIST_MAX_TRACKS = 64;
export const CUT_LIST_MAX_MARKERS = 5000;

const TIMECODE = /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/;
const timecode = v.pipe(v.string(), v.regex(TIMECODE, "Invalid timecode"));

const event = v.object({
	/** Clip name in the editing software */
	name: v.nullable(v.pipe(v.string(), v.maxLength(500))),
	/** In and out on the timeline: record timecodes, absolute like the timeline's start */
	in: timecode,
	out: timecode,
	/** In of the source clip */
	sourceIn: timecode,
});

const marker = v.object({
	name: v.pipe(v.string(), v.maxLength(500)),
	note: v.nullable(v.pipe(v.string(), v.maxLength(5000))),
	/** Record timecode, absolute like the clips' */
	at: timecode,
	/** Length in frames of the list's rate, 0 = point marker */
	duration: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000_000)),
	/** Where it came from and its color (Final Cut: its type), for its category: markerCategory */
	host: v.picklist(["Resolve", "Avid", "Final Cut"]),
	label: v.pipe(v.string(), v.maxLength(50)),
});

export const cutListSchema = v.object({
	format: v.picklist(["edl", "fcpxml"]),
	title: v.pipe(v.string(), v.maxLength(500)),
	/**
	 * The rate the timecodes count in. FCPXML says so; an EDL doesn't, its timecodes count in the
	 * timeline's rate then (null).
	 */
	frameRate: v.nullable(
		v.object({
			fpsNumerator: v.pipe(v.number(), v.integer(), v.minValue(1)),
			fpsDenominator: v.pipe(v.number(), v.integer(), v.minValue(1)),
			dropFrame: v.boolean(),
		}),
	),
	/** Video tracks from the bottom (V1) up, then the audio tracks */
	tracks: v.pipe(
		v.array(
			v.object({
				type: v.picklist(["video", "audio"]),
				name: v.pipe(v.string(), v.maxLength(100)),
				events: v.array(event),
			}),
		),
		v.maxLength(CUT_LIST_MAX_TRACKS),
	),
	markers: v.optional(v.pipe(v.array(marker), v.maxLength(CUT_LIST_MAX_MARKERS)), []),
});

export type CutList = v.InferOutput<typeof cutListSchema>;
export type CutListTrack = CutList["tracks"][number];
export type CutListEvent = CutListTrack["events"][number];
export type CutListMarker = CutList["markers"][number];

export const cutListSize = (list: CutList) => new TextEncoder().encode(JSON.stringify(list)).length;

/** Clips of all tracks, a summary for the upload form */
export function cutListSummary(list: CutList) {
	const of = (type: "video" | "audio") => list.tracks.filter((t) => t.type === type);
	return {
		videoTracks: of("video").length,
		audioTracks: of("audio").length,
		videoClips: of("video").reduce((n, t) => n + t.events.length, 0),
		audioClips: of("audio").reduce((n, t) => n + t.events.length, 0),
		markers: list.markers.length,
	};
}

/** Frame `frame` of `from` at `to`: the same moment, counted in the other rate */
const convert = (frame: number, from: FrameRate, to: FrameRate) =>
	from.fpsNumerator === to.fpsNumerator && from.fpsDenominator === to.fpsDenominator
		? frame
		: Math.round(
				(frame * from.fpsDenominator * to.fpsNumerator) / (from.fpsNumerator * to.fpsDenominator),
			);

/**
 * The cut list's tracks as snapshot tracks at the timeline's frame rate, with absolute frames.
 * Timecodes that don't exist at their rate throw a CutListError. Nothing is moved or cut yet,
 * see applyCutList.
 */
export function cutListTracks(list: CutList, frameRate: FrameRate, mediaId: string): Track[] {
	const rate = list.frameRate ?? frameRate;
	const frame = (tc: string, what: string) => {
		try {
			return convert(parseTimecode(tc, rate), rate, frameRate);
		} catch {
			throw new CutListError(`${what}: ${tc} doesn't fit the frame rate`);
		}
	};
	const counters = { video: 0, audio: 0 };
	return list.tracks.map((track, t) => {
		const number = ++counters[track.type];
		const id = `${track.type === "video" ? "V" : "A"}${number}`;
		const clips: Clip[] = track.events.map((e, i) => {
			const where = `${track.name}, clip ${i + 1}`;
			const start = frame(e.in, where);
			return {
				id: `${id}-${i + 1}`,
				name: e.name ?? `Clip ${i + 1}`,
				mediaId,
				startFrameIndex: start,
				durationFrameCount: frame(e.out, where) - start,
				// the clip is a part of `mediaId`, the uploaded video, which runs like the timeline;
				// where it came from in the editing software is metadata
				sourceStartFrameIndex: start,
				speed: 1,
				metadata: { cutListTrack: t, sourceTimecode: e.sourceIn },
				color: null,
			};
		});
		return { id, type: track.type, name: track.name, clips };
	});
}

/** A marker of the cut list at the timeline's frame rate, before it is placed on the video */
export type CutListMarkerAt = {
	index: number;
	frame: number;
	duration: number;
	marker: CutListMarker;
};

/** The cut list's markers at the timeline's frame rate, with absolute frames; see cutListTracks */
export function cutListMarkers(list: CutList, frameRate: FrameRate): CutListMarkerAt[] {
	const rate = list.frameRate ?? frameRate;
	return list.markers.map((marker, index) => {
		let frame: number;
		try {
			frame = convert(parseTimecode(marker.at, rate), rate, frameRate);
		} catch {
			throw new CutListError(`Marker "${marker.name}": ${marker.at} doesn't fit the frame rate`);
		}
		return { index, frame, duration: convert(marker.duration, rate, frameRate), marker };
	});
}

/** Whether the list has video clips, so its tracks replace the video's estimated ones */
export const hasVideoClips = (list: CutList) =>
	list.tracks.some((t) => t.type === "video" && t.events.length > 0);

/**
 * Checks a cut list before it is stored, without the video's frame rate: an EDL's timecodes at
 * the highest rate the upload form offers, so frame numbers that are only wrong for a lower rate
 * pass here and fail in the worker, which reports them.
 */
export function checkCutList(list: CutList): void {
	if (cutListSize(list) > CUT_LIST_MAX_BYTES) throw new CutListError("The cut list is too large");
	if (!hasVideoClips(list) && list.markers.length === 0) {
		throw new CutListError("The cut list has no video clips and no markers");
	}
	const highest = { fpsNumerator: 60, fpsDenominator: 1, dropFrame: false };
	cutListTracks(list, highest, "check");
	cutListMarkers(list, highest);
}
