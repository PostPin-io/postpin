import type { FrameRate, TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

const pad = (value: number) => String(value).padStart(2, "0");

type FrameTiming = Pick<TimelineSnapshot, "frameRate" | "startFrameIndex">;
const fps = ({ frameRate }: FrameTiming) => frameRate.fpsNumerator / frameRate.fpsDenominator;

export const frameAtSeconds = (seconds: number, timing: FrameTiming) =>
	timing.startFrameIndex + Math.floor(seconds * fps(timing) + 1e-6);

export const secondsAtFrame = (frame: number, timing: FrameTiming) =>
	(frame - timing.startFrameIndex + 0.5) / fps(timing);

/** Formats an absolute frame index as HH:MM:SS:FF, or HH:MM:SS;FF for drop-frame */
export function formatTimecode(frame: number, frameRate: FrameRate): string {
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
