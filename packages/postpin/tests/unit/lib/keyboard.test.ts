import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	commandKeyLabel,
	hasCommandKey,
	isApplePlatform,
	isInsideOverlay,
	isPlainKey,
	isTypingTarget,
} from "#lib/keyboard.ts";

/** Minimal Element stand-in: `closest` matches against a list of selectors this node or a parent matches */
class FakeElement {
	constructor(private matches: string[]) {}
	closest(selector: string) {
		const wanted = selector.split(",").map((s) => s.trim());
		return wanted.some((s) => this.matches.includes(s)) ? this : null;
	}
}

beforeAll(() => vi.stubGlobal("Element", FakeElement));
afterAll(() => vi.unstubAllGlobals());

const event = (target: unknown, mods: Partial<KeyboardEvent> = {}) =>
	({
		target,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		shiftKey: false,
		...mods,
	}) as KeyboardEvent;

describe("isTypingTarget", () => {
	it.each(["input", "textarea", "select", "[contenteditable]"])("true inside %s", (sel) => {
		expect(isTypingTarget(event(new FakeElement([sel])))).toBe(true);
	});

	it("false for other elements and non-elements", () => {
		expect(isTypingTarget(event(new FakeElement(["button"])))).toBe(false);
		expect(isTypingTarget(event(null))).toBe(false);
		expect(isTypingTarget(event({ closest: () => true }))).toBe(false);
	});
});

describe("isInsideOverlay", () => {
	it.each(["dialog[open]", "[role='dialog']", "[role='menu']", "[role='listbox']"])(
		"true inside %s",
		(sel) => {
			expect(isInsideOverlay(event(new FakeElement([sel])))).toBe(true);
		},
	);

	it("false outside overlays", () => {
		expect(isInsideOverlay(event(new FakeElement(["input"])))).toBe(false);
	});

	it("false on a tour card: the keys a tour step lets through work while it has the focus", () => {
		expect(isInsideOverlay(event(new FakeElement(["[role='dialog']", "[data-tour-card]"])))).toBe(
			false,
		);
	});
});

describe("isPlainKey", () => {
	it("plain and shift-only keys are plain", () => {
		expect(isPlainKey(event(null))).toBe(true);
		expect(isPlainKey(event(null, { shiftKey: true }))).toBe(true);
	});

	it.each(["ctrlKey", "altKey", "metaKey"] as const)("%s is not plain", (mod) => {
		expect(isPlainKey(event(null, { [mod]: true }))).toBe(false);
	});

	it("meta is allowed with allowMeta, ctrl/alt still are not", () => {
		expect(isPlainKey(event(null, { metaKey: true }), { allowMeta: true })).toBe(true);
		expect(isPlainKey(event(null, { ctrlKey: true }), { allowMeta: true })).toBe(false);
	});
});

describe("command key", () => {
	it.each(["MacIntel", "iPhone", "iPad"])("is ⌘ on %s", (platform) => {
		expect(isApplePlatform(platform)).toBe(true);
	});

	it.each(["Win32", "Linux x86_64", ""])("is Ctrl on %s", (platform) => {
		expect(isApplePlatform(platform)).toBe(false);
	});

	it("reads ⌘ on Apple keyboards and Ctrl elsewhere", () => {
		const meta = { metaKey: true, ctrlKey: false };
		const ctrl = { metaKey: false, ctrlKey: true };
		expect(hasCommandKey(meta, true)).toBe(true);
		expect(hasCommandKey(ctrl, true)).toBe(false); // Ctrl-click opens the context menu on a Mac
		expect(hasCommandKey(ctrl, false)).toBe(true);
		expect(hasCommandKey(meta, false)).toBe(false); // the Windows key
	});

	it("labels the key for the keyboard", () => {
		expect(commandKeyLabel(true)).toBe("⌘");
		expect(commandKeyLabel(false)).toBe("Ctrl+");
	});
});
