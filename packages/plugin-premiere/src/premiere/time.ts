import type { Sequence, TickTime } from "@adobe/premierepro";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import { ppro } from "../host";

export const TICKS_PER_SECOND = 254016000000n;

export interface Timing {
	ticksPerFrame: bigint;
	// sequence start (zero point) as absolute frame
	startFrame: number;
	frameRate: FrameRate;
}

export async function getTiming(sequence: Sequence): Promise<Timing> {
	const [timebase, zero, display] = await Promise.all([
		sequence.getTimebase(),
		sequence.getZeroPoint(),
		sequence.getSequenceVideoTimeDisplayFormat(),
	]);
	const ticksPerFrame = BigInt(timebase);
	// TODO: 59.94 drop frame has no constant in the 27.0 types
	const dropFrame = display.type === ppro.SequenceSettings.VIDEO_DISPLAY_FORMAT_2997;
	return {
		ticksPerFrame,
		startFrame: Number(BigInt(zero.ticks) / ticksPerFrame),
		frameRate: toFrameRate(ticksPerFrame, dropFrame),
	};
}

function toFrameRate(ticksPerFrame: bigint, dropFrame: boolean): FrameRate {
	return fpsToFrameRate(Number(TICKS_PER_SECOND) / Number(ticksPerFrame), dropFrame);
}

// Rates like 29.97 are NTSC rates, which are exactly n * 1000/1001
export function fpsToFrameRate(value: number, dropFrame: boolean): FrameRate {
	const nominal = Math.round(value);
	if (Math.abs(value - nominal) < 0.001) {
		return { fpsNumerator: nominal, fpsDenominator: 1, dropFrame };
	}
	return { fpsNumerator: nominal * 1000, fpsDenominator: 1001, dropFrame };
}

export const fps = (rate: FrameRate) => rate.fpsNumerator / rate.fpsDenominator;

export function toFrame(time: TickTime, timing: Timing): number {
	const ticks = BigInt(time.ticks);
	return timing.startFrame + Number((ticks + timing.ticksPerFrame / 2n) / timing.ticksPerFrame);
}

export function toTickTime(frame: number, timing: Timing): TickTime {
	const ticks = BigInt(frame - timing.startFrame) * timing.ticksPerFrame;
	return ppro.TickTime.createWithTicks(ticks.toString());
}
