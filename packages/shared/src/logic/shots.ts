import type { Clip, TimelineSnapshot } from "../types/TimelineSnapshot.ts";

export type Shot = {
	index: number;
	clipId: string;
	name: string;
	/** Absolute timeline frame, like the snapshot's */
	startFrameIndex: number;
	durationFrameCount: number;
	/** Absolute timeline frame in the middle of the shot */
	thumbnailFrame: number;
};

const endFrameIndex = (clip: Clip) => clip.startFrameIndex + clip.durationFrameCount;

/**
 * One shot per stretch between two cuts on any video track. The thumbnail comes from the exported
 * video, so it shows the picture whatever lies on top: an adjustment layer or a title over the
 * whole timeline doesn't hide the cuts underneath (it would if only the topmost clip counted).
 */
export function getShots(snapshot: TimelineSnapshot): Shot[] {
	const { videoTracks, stretches, spansCut } = cutStretches(snapshot);
	return stretches.map(({ start, end, covering }, index) => {
		const clip = cutClip(videoTracks, covering, start, spansCut) ?? covering[0]!.clip;
		return {
			index,
			clipId: clip.id,
			name: clip.name,
			startFrameIndex: start,
			durationFrameCount: end - start,
			thumbnailFrame: thumbnailFrame(start, end - start),
		};
	});
}

/** A shot of the grid, with the thumbnail it shows: the one of a shot of {@link getShots} */
export type GridShot = Shot & { thumbnailIndex: number };

/**
 * The other way to see the timeline: one shot per stretch with the same clip on top, named after
 * it. A cut under a clip that covers it doesn't start a shot here, so an adjustment layer or a
 * title over the whole timeline makes it one shot. Renders no thumbnails of its own: each shot
 * shows the one of the shot of {@link getShots} its middle lies in.
 */
export function getTopClipShots(snapshot: TimelineSnapshot): GridShot[] {
	const shots: GridShot[] = [];
	const { stretches } = cutStretches(snapshot);
	for (const { start, end, covering } of stretches) {
		const top = covering[0]!.clip;
		const previous = shots.at(-1);
		if (
			previous?.clipId === top.id &&
			previous.startFrameIndex + previous.durationFrameCount === start
		) {
			// the same clip is still on top, the cut is underneath it
			previous.durationFrameCount += end - start;
		} else {
			shots.push({
				index: shots.length,
				clipId: top.id,
				name: top.name,
				startFrameIndex: start,
				durationFrameCount: end - start,
				thumbnailFrame: 0,
				thumbnailIndex: 0,
			});
		}
	}
	for (const shot of shots) {
		shot.thumbnailFrame = thumbnailFrame(shot.startFrameIndex, shot.durationFrameCount);
		shot.thumbnailIndex = stretches.findIndex(
			(s) => s.start <= shot.thumbnailFrame && shot.thumbnailFrame < s.end,
		);
	}
	return shots;
}

type Covering = { track: number; clip: Clip };

/** The stretches between two cuts on any video track, gaps left out, with the clips on them */
function cutStretches(snapshot: TimelineSnapshot) {
	// tracks[0] is Video 1, so later tracks cover earlier ones (are on top)
	const videoTracks = snapshot.tracks
		.filter((t) => t.type === "video")
		.map((t) => t.clips.filter((c) => c.durationFrameCount > 0));
	const cuts = [
		...new Set(videoTracks.flatMap((t) => t.flatMap((c) => [c.startFrameIndex, endFrameIndex(c)]))),
	].sort((a, b) => a - b);
	const spansCut = (c: Clip) => cuts.some((f) => f > c.startFrameIndex && f < endFrameIndex(c));

	const stretches: { start: number; end: number; covering: Covering[] }[] = [];
	// no clip starts or ends between two cuts, so the same clips cover the whole stretch
	for (let i = 0; i < cuts.length - 1; i++) {
		const start = cuts[i]!;
		const end = cuts[i + 1]!;
		// by track, topmost first
		const covering = videoTracks
			.map((clips, track) => ({
				track,
				clip: clips.find((c) => c.startFrameIndex <= start && endFrameIndex(c) >= end),
			}))
			.filter((c): c is Covering => c.clip !== undefined)
			.reverse();
		// a blank space in the picture
		if (covering.length > 0) stretches.push({ start, end, covering });
	}
	return { videoTracks, stretches, spansCut };
}

/**
 * The clip the cut at `start` brings in, to name the shot after: one that begins there, or one
 * that comes to view because a clip above it ends there. Clips running on across the cut (an
 * adjustment layer, a title) don't count. Of several, the topmost that doesn't itself run across
 * a later cut, so an adjustment layer starting with the first clip doesn't name the shot either.
 */
function cutClip(
	videoTracks: Clip[][],
	covering: Covering[],
	start: number,
	spansCut: (c: Clip) => boolean,
): Clip | undefined {
	const endingTracks = videoTracks.flatMap((clips, track) =>
		clips.some((c) => endFrameIndex(c) === start) ? [track] : [],
	);
	const brought = covering.filter(
		({ track, clip }) =>
			clip.startFrameIndex === start ||
			// the topmost clip below an ending one
			endingTracks.some((t) => covering.find((c) => c.track < t)?.track === track),
	);
	return (brought.find(({ clip }) => !spansCut(clip)) ?? brought[0])?.clip;
}

// dont take the first frame, but rather
const thumbnailFrame = (start: number, duration: number) => start + Math.floor(duration / 2);
