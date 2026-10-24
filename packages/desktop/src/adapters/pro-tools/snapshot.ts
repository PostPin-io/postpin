import type { TimelineSnapshot, Track } from "@postpin-io/shared/types/TimelineSnapshot";
import { TrackType } from "../../third-party/protools-sdk/dist/PTSL";
import { iterateAll } from "./pagination";
import { send } from "./ptsl";
import { getSessionIds, getSessionName, type SessionTiming } from "./session";
import { getSelectionFrames } from "./time";

const SNAPSHOT_TRACK_TYPES: Partial<Record<TrackType, Track["type"]>> = {
	[TrackType.TType_Audio]: "audio",
	[TrackType.TType_Video]: "video",
};

// PTSL can't list clip positions, so the snapshot only has tracks (snapshotClips: false).
// It covers the edit selection, the same range renderPreview bounces.
export async function buildTimelineSnapshot(timing: SessionTiming): Promise<TimelineSnapshot> {
	const [{ originId }, name, { startFrame, endFrame }, trackList] = await Promise.all([
		getSessionIds(),
		getSessionName(),
		getSelectionFrames(timing),
		iterateAll(
			(request) => send("GetTrackList", request),
			(response) => response.trackList,
		),
	]);

	const tracks = trackList.flatMap((track): Track[] => {
		const type = SNAPSHOT_TRACK_TYPES[track.type];
		return type ? [{ id: track.id, type, name: track.name, clips: [] }] : [];
	});

	return {
		id: originId,
		name,
		tracks,
		mediaItems: [],
		frameRate: timing.frameRate,
		startFrameIndex: startFrame,
		durationFrameCount: endFrame - startFrame,
		metadata: {},
	};
}
