import type { FrameRate, TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import Timecode from "smpte-timecode";

const pad = (value: number) => String(value).padStart(2, "0");

export type FrameTiming = Pick<TimelineSnapshot, "frameRate" | "startFrameIndex">;
const fps = ({ frameRate }: FrameTiming) => frameRate.fpsNumerator / frameRate.fpsDenominator;

export const frameAtSeconds = (seconds: number, timing: FrameTiming) =>
	// 1e-3 frames: Chrome reports times in whole microseconds, so frame starts at 23.976/59.94 land just below the boundary
	timing.startFrameIndex + Math.floor(seconds * fps(timing) + 1e-3);

export const secondsAtFrame = (frame: number, timing: FrameTiming) =>
	(frame - timing.startFrameIndex + 0.5) / fps(timing);

/** Shown instead of a timecode for frames we can't represent (negative or 24 h and more) */
export const INVALID_TIMECODE = "--:--:--:--";

const nominalFpsOf = (frameRate: FrameRate) =>
	Math.round(frameRate.fpsNumerator / frameRate.fpsDenominator);

/** Number of frames in 24 hours, i.e. the first frame that has no timecode any more */
export function framesPerDay(frameRate: FrameRate): number {
	const nominalFps = nominalFpsOf(frameRate);
	if (!frameRate.dropFrame) return nominalFps * 86_400;
	// drop-frame: 144 blocks of 10 minutes per day
	const dropped = Math.round(nominalFps / 15);
	const framesPer10Minutes = (nominalFps * 60 - dropped) * 10 + dropped;
	return framesPer10Minutes * 144;
}

/** Timecodes cover 00:00:00:00 up to (not including) 24:00:00:00 */
export const isTimecodeFrame = (frame: number, frameRate: FrameRate) =>
	Number.isInteger(frame) && frame >= 0 && frame < framesPerDay(frameRate);

export function formatTimecode(frame: number, frameRate: FrameRate): string {
	if (!isTimecodeFrame(frame, frameRate)) return INVALID_TIMECODE;
	// Timecode counts frames at the nominal rate (60 for 59.94), not the real one
	const nominalFps = Math.round(frameRate.fpsNumerator / frameRate.fpsDenominator);

	let timecodeFrame = frame;
	if (frameRate.dropFrame) {
		// Drop-frame skips frame numbers 0 and 1 (0-3 at 59.94) every minute, except every tenth minute
		const dropped = Math.round(nominalFps / 15);
		const framesPerMinute = nominalFps * 60 - dropped;
		const framesPer10Minutes = framesPerMinute * 10 + dropped;
		const tenMinutes = Math.floor(frame / framesPer10Minutes);
		const rest = frame % framesPer10Minutes;
		const minutes = rest > dropped ? Math.floor((rest - dropped) / framesPerMinute) : 0;
		timecodeFrame = frame + dropped * (9 * tenMinutes + minutes);
	}

	const hours = Math.floor(timecodeFrame / (nominalFps * 3600));
	const minutes = Math.floor(timecodeFrame / (nominalFps * 60)) % 60;
	const seconds = Math.floor(timecodeFrame / nominalFps) % 60;
	const frames = timecodeFrame % nominalFps;
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${frameRate.dropFrame ? ";" : ":"}${pad(frames)}`;
}

export function parseTimecode(timecode: string, frameRate: FrameRate): number {
	const withoutSeparators = timecode.replace(/[:;]/g, "");
	if (!/^\d{1,8}$/.test(withoutSeparators)) throw new Error(`Invalid timecode: ${timecode}`);
	const padded = withoutSeparators.padStart(8, "0");
	const hours = parseInt(padded.slice(0, 2), 10);
	const minutes = parseInt(padded.slice(2, 4), 10);
	const seconds = parseInt(padded.slice(4, 6), 10);
	const frames = parseInt(padded.slice(6, 8), 10);
	if (
		hours > 23 ||
		minutes > 59 ||
		seconds > 59 ||
		frames >= Math.round(frameRate.fpsNumerator / frameRate.fpsDenominator)
	)
		throw new Error(`Invalid timecode: ${timecode}`);

	timecode = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${frameRate.dropFrame ? ";" : ":"}${pad(frames)}`;
	return new Timecode(
		timecode,
		[frameRate.fpsNumerator, frameRate.fpsDenominator],
		frameRate.dropFrame,
	).frameCount;
}
