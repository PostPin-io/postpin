import { describe, expect, it } from "vitest";
import {
	screeningChannelName,
	screeningPatch,
	type ScreeningState,
} from "#lib/components/screening/screening-protocol.ts";

const state = (change: Partial<ScreeningState> = {}): ScreeningState => ({
	time: 10,
	paused: true,
	rate: 1,
	muted: false,
	quality: "auto",
	qr: false,
	...change,
});
const FRAME = 1 / 25;

describe("screeningPatch", () => {
	it("nothing to send when the window is where the view wants it", () => {
		expect(screeningPatch(state(), state(), FRAME)).toBeNull();
	});

	it("playback drift below half a frame is no seek", () => {
		expect(screeningPatch(state(), state({ time: 10 + FRAME / 2 - 0.001 }), FRAME)).toBeNull();
	});

	it("a step of one frame is a seek, in both directions", () => {
		expect(screeningPatch(state(), state({ time: 10 + FRAME }), FRAME)).toEqual({
			time: 10 + FRAME,
		});
		expect(screeningPatch(state(), state({ time: 10 - FRAME }), FRAME)).toEqual({
			time: 10 - FRAME,
		});
	});

	it("only the fields that differ go out", () => {
		expect(screeningPatch(state(), state({ paused: false }), FRAME)).toEqual({ paused: false });
		expect(
			screeningPatch(state(), state({ rate: 2, muted: true, quality: 720, qr: true }), FRAME),
		).toEqual({ rate: 2, muted: true, quality: 720, qr: true });
	});

	it("a seek and a state change travel together", () => {
		expect(screeningPatch(state(), state({ time: 0, paused: false }), FRAME)).toEqual({
			time: 0,
			paused: false,
		});
	});
});

describe("screeningChannelName", () => {
	it("is a channel of its own per screening", () => {
		expect(screeningChannelName("a")).not.toBe(screeningChannelName("b"));
	});
});
