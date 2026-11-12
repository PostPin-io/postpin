import { describe, expect, it } from "vitest";
import { isInTimeline, lastFrameOf, timelineBounds } from "../../src/logic/ranges.ts";

// 100 frames from 86400: 86400 … 86499
const timeline = { startFrameIndex: 86400, durationFrameCount: 100 };

describe("lastFrameOf", () => {
	it("a point marker covers its own frame", () => {
		expect(lastFrameOf({ frame: 10, duration: 0 })).toBe(10);
	});

	it("a range covers duration frames from its start", () => {
		expect(lastFrameOf({ frame: 10, duration: 1 })).toBe(10);
		expect(lastFrameOf({ frame: 10, duration: 24 })).toBe(33);
	});
});

describe("timelineBounds", () => {
	it("first and last frame", () => {
		expect(timelineBounds(timeline)).toEqual({ first: 86400, last: 86499 });
	});

	it("an empty timeline still has its start frame", () => {
		expect(timelineBounds({ startFrameIndex: 5, durationFrameCount: 0 })).toEqual({
			first: 5,
			last: 5,
		});
	});
});

describe("isInTimeline", () => {
	it.each([
		[86400, 0],
		[86499, 0],
		[86400, 100],
		[86450, 50],
	])("frame %i with duration %i fits", (frame, duration) => {
		expect(isInTimeline({ frame, duration }, timeline)).toBe(true);
	});

	it.each([
		[86399, 0],
		[86500, 0],
		[86399, 10],
		[86400, 101],
		[86450, 51],
	])("frame %i with duration %i doesn't", (frame, duration) => {
		expect(isInTimeline({ frame, duration }, timeline)).toBe(false);
	});
});
