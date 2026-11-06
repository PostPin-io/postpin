/** Frame-index input (relative to the timeline start) → absolute timeline frame. */
export function frameFromInput(input: string, startFrame: number): number {
	const value = input.trim();
	if (!/^\d+$/.test(value)) throw new Error(`Not a frame number: "${input}"`);
	return Number(value) + startFrame;
}

/** Keeps an absolute frame inside the timeline: startFrame … startFrame + frameCount - 1. */
export function clampToTimeline(frame: number, startFrame: number, frameCount: number): number {
	const lastFrame = startFrame + Math.max(frameCount, 1) - 1;
	return Math.min(Math.max(frame, startFrame), lastFrame);
}
