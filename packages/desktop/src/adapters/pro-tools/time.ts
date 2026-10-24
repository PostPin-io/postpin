import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
import { TimelineLocationType } from "../../third-party/protools-sdk/dist/PTSL";
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

// default export length would be full session length (24h by default), so use selection
export async function getSelectionFrames(
	timing: SessionTiming,
): Promise<{ startFrame: number; endFrame: number }> {
	const { inTime, outTime } = await send("GetEditSelection", {
		locationType: TimelineLocationType.TLType_TimeCode,
	});
	const startFrame = parseProToolsTimecode(inTime, timing.frameRate);
	const endFrame = parseProToolsTimecode(outTime, timing.frameRate);
	if (endFrame <= startFrame) {
		throw new Error("Select the range to render in the Pro Tools timeline first");
	}
	return { startFrame, endFrame };
}
