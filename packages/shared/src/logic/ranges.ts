/** A marker's place on the timeline: duration 0 is a point marker */
export interface FrameRange {
	frame: number;
	duration: number;
}

export interface TimelineRange {
	startFrameIndex: number;
	durationFrameCount: number;
}

/** The last frame a marker covers. A point marker covers its own frame. */
export const lastFrameOf = ({ frame, duration }: FrameRange) => frame + Math.max(duration, 1) - 1;

/** First and last frame of a timeline. An empty timeline still has its start frame. */
export function timelineBounds({ startFrameIndex, durationFrameCount }: TimelineRange) {
	return {
		first: startFrameIndex,
		last: startFrameIndex + Math.max(durationFrameCount, 1) - 1,
	};
}

/** Whether the whole range sits on the timeline, from its start to its last frame */
export function isInTimeline(range: FrameRange, timeline: TimelineRange) {
	const { first, last } = timelineBounds(timeline);
	return range.frame >= first && lastFrameOf(range) <= last;
}
