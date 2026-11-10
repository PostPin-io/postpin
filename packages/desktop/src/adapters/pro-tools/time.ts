import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
import { TimelineLocationType, TrackType } from "../../third-party/protools-sdk/dist/PTSL";
import { iterateAll } from "./pagination";
import { send } from "./ptsl";
import type { SessionTiming } from "./session";

// need to remove subframes
export function parseProToolsTimecode(timecode: string, frameRate: FrameRate) {
	return parseTimecode(timecode.trim().replace(/\.\d+$/, ""), frameRate);
}

// could be stored as samples or bars and beats
const locationType = (location: string) =>
	location.includes("|")
		? TimelineLocationType.TLType_BarsBeats
		: TimelineLocationType.TLType_Samples;

export async function samplesToFrame(samples: string, timing: SessionTiming): Promise<number> {
	const { convertedLocation } = await send("GetTimeAsType", {
		location: { location: samples, timeType: locationType(samples) },
		timeType: TimelineLocationType.TLType_TimeCode,
	});
	if (!convertedLocation) throw new Error(`Pro Tools couldn't convert position ${samples}`);
	return parseProToolsTimecode(convertedLocation.location, timing.frameRate);
}

export async function frameToSamples(frame: number, timing: SessionTiming): Promise<string> {
	const { convertedLocation } = await send("GetTimeAsType", {
		location: {
			location: formatTimecode(frame, timing.frameRate),
			timeType: TimelineLocationType.TLType_TimeCode,
		},
		timeType: TimelineLocationType.TLType_Samples,
	});
	if (!convertedLocation) throw new Error(`Pro Tools couldn't convert frame ${frame}`);
	return convertedLocation.location;
}

const getEditSelection = (locationType: TimelineLocationType) =>
	send("GetEditSelection", { locationType });

const setEditSelection = (inTime: number, outTime: number) =>
	send("SetTimelineSelection", {
		inTime: String(inTime),
		outTime: String(outTime),
		locationType: TimelineLocationType.TLType_Samples,
	});

// The range from the first to the last clip on the audio and video tracks, in samples. PTSL can't
// list clip positions, but selecting all clips on a track shows their range in the edit selection.
async function getClipRange(): Promise<{ start: number; end: number } | null> {
	const tracks = await iterateAll(
		(request) => send("GetTrackList", request),
		(response) => response.trackList,
	);
	let range: { start: number; end: number } | null = null;
	for (const track of tracks) {
		if (track.type !== TrackType.TType_Audio && track.type !== TrackType.TType_Video) continue;
		// A track without clips leaves the selection as it was, so start from an empty one
		await setEditSelection(0, 0);
		await send("SelectAllClipsOnTrack", { trackId: track.id });
		const { inTime, outTime } = await getEditSelection(TimelineLocationType.TLType_Samples);
		const start = Number(inTime);
		const end = Number(outTime);
		if (end <= start) continue;
		range = range
			? { start: Math.min(range.start, start), end: Math.max(range.end, end) }
			: { start, end };
	}
	return range;
}

// Shared, so concurrent calls don't move the selection under each other
let selectingClips: Promise<void> | null = null;

// Selects all clips, keeping the cursor where it was when there are none
function selectClipRange() {
	selectingClips ??= (async () => {
		const cursor = await getEditSelection(TimelineLocationType.TLType_Samples);
		const range = await getClipRange();
		if (range) {
			await setEditSelection(range.start, range.end);
		} else {
			await setEditSelection(Number(cursor.inTime), Number(cursor.outTime));
		}
	})().finally(() => {
		selectingClips = null;
	});
	return selectingClips;
}

async function readSelectionFrames(timing: SessionTiming) {
	const { inTime, outTime } = await getEditSelection(TimelineLocationType.TLType_TimeCode);
	return {
		startFrame: parseProToolsTimecode(inTime, timing.frameRate),
		endFrame: parseProToolsTimecode(outTime, timing.frameRate),
	};
}

// The edit selection, since the default export length would be the full session length (24h by
// default). Without a selection, all clips get selected, so the user sees what gets rendered.
export async function getSelectionFrames(
	timing: SessionTiming,
): Promise<{ startFrame: number; endFrame: number }> {
	let frames = await readSelectionFrames(timing);
	if (frames.endFrame <= frames.startFrame) {
		await selectClipRange();
		frames = await readSelectionFrames(timing);
	}
	if (frames.endFrame <= frames.startFrame) {
		throw new Error(
			"The Pro Tools session has no clips to render, select the range in the timeline",
		);
	}
	return frames;
}
