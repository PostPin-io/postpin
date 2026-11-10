import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { PLAYBACK_RATES, type TimelineMode } from "#lib/components/review/video-player.ts";

type Track = TimelineSnapshot["tracks"][number];

export type Lane = {
	id: string;
	name: string;
	type: string;
	clips: Track["clips"];
};

/** Tick intervals in frames (below one second) and in seconds */
const TICK_STEPS_FRAMES = [1, 2, 5, 10];
const TICK_STEPS_SECONDS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];

/**
 * Lanes to draw. full: every track, video top-down (highest track first), then audio.
 * compact: one merged lane per type. scrub: none.
 */
export function buildLanes(tracks: Track[], mode: TimelineMode): Lane[] {
	if (mode === "scrub") return [];
	const video = tracks.filter((track) => track.type === "video");
	const audio = tracks.filter((track) => track.type === "audio");
	if (mode === "full") return [...[...video].reverse(), ...audio];
	// Higher tracks come later and are drawn on top
	const merge = (type: string, name: string, list: Track[]): Lane[] =>
		list.length > 0 ? [{ id: type, name, type, clips: list.flatMap((track) => track.clips) }] : [];
	return [...merge("video", "Video", video), ...merge("audio", "Audio", audio)];
}

/** Number of lanes in compact mode (one per present track type) */
export function collapsedLaneCount(tracks: Track[], mode: TimelineMode): number {
	if (mode === "scrub") return 0;
	return new Set(tracks.map((t) => t.type).filter((t) => t === "video" || t === "audio")).size;
}

/** Sorted, unique clip starts and ends on all tracks, plus the timeline bounds. */
export function timelineCuts(tracks: Track[], firstFrame: number, lastFrame: number): number[] {
	return [
		...new Set([
			firstFrame,
			lastFrame,
			...tracks.flatMap((track) =>
				track.clips.flatMap((clip) => [
					clip.startFrameIndex,
					// ensure that end is within the timeline
					Math.min(clip.startFrameIndex + clip.durationFrameCount, lastFrame),
				]),
			),
		]),
	].sort((a, b) => a - b);
}

/** Next cut after / last cut before `position` in sorted `cuts`. */
export function adjacentCut(cuts: number[], position: number, direction: -1 | 1) {
	return direction < 0
		? cuts.findLast((frame) => frame < position)
		: cuts.find((frame) => frame > position);
}

/** One step slower/faster, clamped to the list. Rates between steps snap to the next higher one first. */
export function stepPlaybackRate(current: number, direction: -1 | 1): number {
	const index = PLAYBACK_RATES.findIndex((rate) => rate >= current);
	const at = index === -1 ? PLAYBACK_RATES.length - 1 : index;
	return PLAYBACK_RATES[Math.min(Math.max(at + direction, 0), PLAYBACK_RATES.length - 1)]!;
}

/** Smallest tick interval (in frames) that keeps labels `minSpacing` px apart. */
export function tickStep(pixelsPerFrame: number, fps: number, minSpacing: number): number {
	const minFrames = minSpacing / pixelsPerFrame;
	const steps = [...TICK_STEPS_FRAMES, ...TICK_STEPS_SECONDS.map((s) => Math.round(s * fps))];
	return steps.find((step) => step >= minFrames) ?? steps[steps.length - 1]!;
}

/** Absolute frames of the ruler ticks inside the scrolled viewport. */
export function visibleTicks(v: {
	scrollLeft: number;
	viewportWidth: number;
	pixelsPerFrame: number;
	tickFrames: number;
	durationFrameCount: number;
	firstFrame: number;
}): number[] {
	if (v.pixelsPerFrame <= 0) return [];
	const first = Math.floor(v.scrollLeft / v.pixelsPerFrame / v.tickFrames);
	const last = Math.min(
		Math.ceil((v.scrollLeft + v.viewportWidth) / v.pixelsPerFrame / v.tickFrames),
		Math.floor((v.durationFrameCount - 1) / v.tickFrames),
	);
	return Array.from(
		{ length: Math.max(last - first + 1, 0) },
		(_, i) => v.firstFrame + (first + i) * v.tickFrames,
	);
}
