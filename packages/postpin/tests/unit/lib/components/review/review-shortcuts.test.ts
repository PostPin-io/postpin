import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	handleReviewShortcut,
	type ReviewShortcutTargets,
} from "#lib/components/review/review-shortcuts.ts";

/** Element stand-in for isTypingTarget's instanceof check; inputs and dialogs match a selector */
class FakeElement {
	constructor(private selectors: string[]) {}
	closest(selector: string) {
		const wanted = selector.split(",").map((s) => s.trim());
		return wanted.some((s) => this.selectors.includes(s)) ? this : null;
	}
}

beforeAll(() => vi.stubGlobal("Element", FakeElement));
afterAll(() => vi.unstubAllGlobals());

const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
	({
		key: k,
		target: null,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		shiftKey: false,
		repeat: false,
		defaultPrevented: false,
		preventDefault: vi.fn(),
		...mods,
	}) as unknown as KeyboardEvent;

/** As on a Mac, where ⌘ is the command key */
const handle = (event: KeyboardEvent, t: ReviewShortcutTargets) =>
	handleReviewShortcut(event, t, { apple: true });

const targets = () => ({
	timeline: {
		stepFrames: vi.fn(),
		seekToAdjacentMarker: vi.fn(),
		seekToCut: vi.fn(),
		seekToStart: vi.fn(),
		seekToEnd: vi.fn(),
		changePlaybackRate: vi.fn(),
		marks: { markIn: vi.fn(), markOut: vi.fn(), clearMarks: vi.fn() },
	},
	player: { toggleFullscreen: vi.fn() },
	togglePlayback: vi.fn(),
});

describe("handleReviewShortcut", () => {
	it("space toggles playback, not when repeated", () => {
		const t = targets();
		const e = key(" ");
		handle(e, t);
		handle(key(" ", { repeat: true }), t);
		expect(t.togglePlayback).toHaveBeenCalledOnce();
		expect(e.preventDefault).toHaveBeenCalled();
	});

	it.each([
		["ArrowLeft", {}, "seekToAdjacentMarker", [-1]],
		["ArrowRight", {}, "seekToAdjacentMarker", [1]],
		["ArrowLeft", { metaKey: true }, "stepFrames", [-1, false]],
		["ArrowRight", { metaKey: true, shiftKey: true }, "stepFrames", [1, true]],
		["ArrowUp", {}, "seekToCut", [-1]],
		["ArrowDown", {}, "seekToCut", [1]],
		["Home", {}, "seekToStart", []],
		["End", {}, "seekToEnd", []],
		["+", {}, "changePlaybackRate", [1]],
		["-", {}, "changePlaybackRate", [-1]],
	] as const)("%s %o → timeline.%s", (k, mods, method, args) => {
		const t = targets();
		handle(key(k, mods), t);
		expect(t.timeline[method]).toHaveBeenCalledWith(...args);
	});

	it("f toggles fullscreen, not with Cmd", () => {
		const t = targets();
		handle(key("f"), t);
		handle(key("F", { metaKey: true }), t);
		expect(t.player.toggleFullscreen).toHaveBeenCalledOnce();
	});

	it("without a timeline (share link without timeline panel) arrows do nothing, space still works", () => {
		const t = { ...targets(), timeline: undefined };
		expect(() => handle(key("ArrowLeft"), t)).not.toThrow();
		handle(key(" "), t);
		expect(t.togglePlayback).toHaveBeenCalledOnce();
	});

	it("ignores Ctrl/Alt combos, already handled events and unknown keys", () => {
		const t = targets();
		for (const e of [
			key(" ", { ctrlKey: true }),
			key(" ", { altKey: true }),
			key(" ", { defaultPrevented: true }),
			key("x"),
		]) {
			handle(e, t);
			expect(e.preventDefault).not.toHaveBeenCalled();
		}
		expect(t.togglePlayback).not.toHaveBeenCalled();
	});

	it("ignores keys while typing (note field, marker name) and inside dialogs", () => {
		const t = targets();
		handle(key(" ", { target: new FakeElement(["textarea"]) } as never), t);
		handle(key(" ", { target: new FakeElement(["dialog[open]"]) } as never), t);
		expect(t.togglePlayback).not.toHaveBeenCalled();
	});

	it.each([
		["i", {}, "markIn"],
		["I", { shiftKey: true }, "markIn"],
		["o", {}, "markOut"],
		["c", {}, "clearMarks"],
		["X", { shiftKey: true }, "clearMarks"],
	] as const)("%s %o calls %s", (k, mods, method) => {
		const t = targets();
		const e = key(k, mods);
		handle(e, t);
		expect(t.timeline.marks[method]).toHaveBeenCalledOnce();
		expect(e.preventDefault).toHaveBeenCalled();
	});

	it("x without shift doesn't clear the marks", () => {
		const t = targets();
		const e = key("x");
		handle(e, t);
		expect(t.timeline.marks.clearMarks).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it("in/out ignore repeats and ⌘", () => {
		const t = targets();
		handle(key("i", { repeat: true }), t);
		handle(key("o", { metaKey: true }), t);
		handle(key("c", { metaKey: true }), t);
		expect(t.timeline.marks.markIn).not.toHaveBeenCalled();
		expect(t.timeline.marks.markOut).not.toHaveBeenCalled();
		expect(t.timeline.marks.clearMarks).not.toHaveBeenCalled();
	});

	it("in/out do nothing while typing", () => {
		const t = targets();
		handle(key("i", { target: new FakeElement(["input"]) } as never), t);
		expect(t.timeline.marks.markIn).not.toHaveBeenCalled();
	});

	it("? opens the shortcut list", () => {
		const showShortcuts = vi.fn();
		const e = key("?", { shiftKey: true });
		handle(e, { ...targets(), showShortcuts });
		expect(showShortcuts).toHaveBeenCalledOnce();
		expect(e.preventDefault).toHaveBeenCalled();
	});

	it("uses Ctrl instead of ⌘ for frame steps on other platforms", () => {
		const t = targets();
		handleReviewShortcut(key("ArrowLeft", { ctrlKey: true }), t, { apple: false });
		handleReviewShortcut(key("ArrowRight", { ctrlKey: true, shiftKey: true }), t, { apple: false });
		expect(t.timeline.stepFrames).toHaveBeenNthCalledWith(1, -1, false);
		expect(t.timeline.stepFrames).toHaveBeenNthCalledWith(2, 1, true);
		// The Windows key is not the command key there
		handleReviewShortcut(key(" ", { metaKey: true }), t, { apple: false });
		expect(t.togglePlayback).not.toHaveBeenCalled();
	});
});
