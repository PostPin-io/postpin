import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import { SessionTimeCodeRate } from "../../third-party/protools-sdk/dist/PTSL";
import { send } from "./ptsl";
import { parseProToolsTimecode } from "./time";

export interface SessionTiming {
	frameRate: FrameRate;
	startFrameIndex: number; // session start as absolute frame
}

export async function getSessionIds(): Promise<{ originId: string; instanceId: string }> {
	const res = await send("GetSessionIDs");
	return {
		instanceId: res.instanceId,
		originId: res.originId,
	};
}
export async function getSessionName(): Promise<string> {
	return (await send("GetSessionName")).sessionName;
}
export function toFrameRate(rate: SessionTimeCodeRate): FrameRate {
	switch (rate) {
		case SessionTimeCodeRate.STCRate_Fps23976:
			return { fpsNumerator: 24000, fpsDenominator: 1001, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps24:
			return { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps25:
			return { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps2997:
			return { fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps2997Drop:
			return { fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: true };
		case SessionTimeCodeRate.STCRate_Fps30:
			return { fpsNumerator: 30, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps30Drop:
			return { fpsNumerator: 30, fpsDenominator: 1, dropFrame: true };
		case SessionTimeCodeRate.STCRate_Fps47952:
			return { fpsNumerator: 48000, fpsDenominator: 1001, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps48:
			return { fpsNumerator: 48, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps50:
			return { fpsNumerator: 50, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps5994:
			return { fpsNumerator: 60000, fpsDenominator: 1001, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps5994Drop:
			return { fpsNumerator: 60000, fpsDenominator: 1001, dropFrame: true };
		case SessionTimeCodeRate.STCRate_Fps60:
			return { fpsNumerator: 60, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps60Drop:
			return { fpsNumerator: 60, fpsDenominator: 1, dropFrame: true };
		case SessionTimeCodeRate.STCRate_Fps100:
			return { fpsNumerator: 100, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps11988:
			return { fpsNumerator: 120000, fpsDenominator: 1001, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps11988Drop:
			return { fpsNumerator: 120000, fpsDenominator: 1001, dropFrame: true };
		case SessionTimeCodeRate.STCRate_Fps120:
			return { fpsNumerator: 120, fpsDenominator: 1, dropFrame: false };
		case SessionTimeCodeRate.STCRate_Fps120Drop:
			return { fpsNumerator: 120, fpsDenominator: 1, dropFrame: true };
		default:
			throw new Error(`Unsupported session timecode rate ${rate}`);
	}
}
export async function getSessionTiming(): Promise<SessionTiming> {
	const [timecodeRate, startTime] = await Promise.all([
		send("GetSessionTimeCodeRate"),
		send("GetSessionStartTime"),
	]);
	const frameRate = toFrameRate(timecodeRate.currentSetting);
	return {
		frameRate,
		startFrameIndex: parseProToolsTimecode(startTime.sessionStartTime, frameRate),
	};
}
