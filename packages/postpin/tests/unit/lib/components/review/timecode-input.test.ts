import { describe, expect, it } from "vitest";
import { clampToTimeline, frameFromInput } from "#lib/components/review/timecodeInput.ts";

describe("frameFromInput", () => {
	it("adds the timeline start", () => {
		expect(frameFromInput("0", 86400)).toBe(86400);
		expect(frameFromInput("25", 86400)).toBe(86425);
	});

	it("trims surrounding spaces", () => {
		expect(frameFromInput(" 12 ", 100)).toBe(112);
	});

	it.each(["abc", "", "  ", "12abc", "-5", "1.5", "1e3"])(
		"rejects non-numeric input %j",
		(input) => {
			expect(() => frameFromInput(input, 0)).toThrow();
		},
	);
});

describe("clampToTimeline", () => {
	// timeline of 100 frames starting at 86400 → last frame 86499
	it.each([
		[86450, 86450],
		[86400, 86400],
		[86499, 86499],
		[86500, 86499],
		[999999, 86499],
		[86399, 86400],
		[0, 86400],
	])("%i → %i", (frame, expected) => {
		expect(clampToTimeline(frame, 86400, 100)).toBe(expected);
	});

	it("an empty timeline pins everything to its start", () => {
		expect(clampToTimeline(5, 10, 0)).toBe(10);
		expect(clampToTimeline(50, 10, 0)).toBe(10);
	});
});
