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

export function getShots(snapshot: TimelineSnapshot): Shot[] {
	// tracks[0] is Video 1, so later tracks cover earlier ones (are on top)
	const videoTracks = snapshot.tracks.filter((t) => t.type === "video");
	const cuts = [
		...new Set(
			videoTracks.flatMap((t) => t.clips.flatMap((c) => [c.startFrameIndex, endFrameIndex(c)])),
		),
	].sort((a, b) => a - b);

	const shots: Shot[] = [];
	// no clip starts or ends between two cuts, so one clip is on top for the whole stretch
	for (let i = 0; i < cuts.length - 1; i++) {
		const start = cuts[i]!;
		const end = cuts[i + 1]!;
		let topmostClip: Clip | undefined;
		for (let t = videoTracks.length - 1; t >= 0 && !topmostClip; t--) {
			topmostClip = videoTracks[t]!.clips.find(
				(c) => c.startFrameIndex <= start && endFrameIndex(c) >= end,
			);
		}
		// a blank space in the picture
		if (!topmostClip) continue;

		const previous = shots.at(-1);
		if (
			previous?.clipId === topmostClip.id &&
			previous.startFrameIndex + previous.durationFrameCount === start
		) {
			// is just a continuation of the previous shot, because the same clip is still on top and the new one just comes in at the bottom
			previous.durationFrameCount += end - start;
			previous.thumbnailFrame = thumbnailFrame(
				previous.startFrameIndex,
				previous.durationFrameCount,
			);
		} else {
			// is a new clip
			shots.push({
				index: shots.length,
				clipId: topmostClip.id,
				name: topmostClip.name,
				startFrameIndex: start,
				durationFrameCount: end - start,
				thumbnailFrame: thumbnailFrame(start, end - start),
			});
		}
	}
	return shots;
}

// dont take the first frame, but rather
const thumbnailFrame = (start: number, duration: number) => start + Math.floor(duration / 2);
