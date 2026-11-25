/** Resolves on the next `type` event, or after the timeout: a missed event never hangs the caller */
export function once(target: EventTarget, type: string, timeoutMs = 10_000) {
	return new Promise<void>((resolve) => {
		const done = () => {
			clearTimeout(timer);
			target.removeEventListener(type, done);
			resolve();
		};
		const timer = setTimeout(done, timeoutMs);
		target.addEventListener(type, done);
	});
}

export function isBuffered(ranges: TimeRanges, time: number) {
	for (let i = 0; i < ranges.length; i++) {
		if (time >= ranges.start(i) && time < ranges.end(i)) return true;
	}
	return false;
}

/**
 * Seeks to a time and waits until the frame is there. hls.js loads the next segment for a cold seek to
 * the last frames before a segment boundary, so the wrong frame shows: seeking a little earlier first
 * loads the right segment.
 */
export async function seekVideo(video: HTMLVideoElement, time: number) {
	if (time > 0.1 && !isBuffered(video.buffered, time)) {
		const preSeeked = once(video, "seeked");
		video.currentTime = time - 0.1;
		await preSeeked;
	}
	const seeked = once(video, "seeked");
	video.currentTime = time;
	await seeked;
}
