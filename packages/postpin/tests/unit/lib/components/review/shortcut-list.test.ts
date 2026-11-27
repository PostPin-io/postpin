import { describe, expect, it } from "vitest";
import { reviewShortcutGroups } from "#lib/components/review/shortcut-list.ts";

const labels = (share: boolean, apple = true) =>
	reviewShortcutGroups({ share, apple }).flatMap((group) => group.shortcuts.map((s) => s.label));

describe("reviewShortcutGroups", () => {
	it("guests paste within their link's export, the team also on other exports", () => {
		expect(labels(false)).toContain("Paste markers at the playhead, also on another export");
		expect(labels(true)).toContain("Paste markers at the playhead");
		expect(labels(true)).toContain("Undo a marker change");
	});

	it("redo is ⌘⇧Z on Apple keyboards, Ctrl+Shift+Z or Ctrl+Y elsewhere", () => {
		const redo = (apple: boolean) =>
			reviewShortcutGroups({ share: false, apple })
				.flatMap((group) => group.shortcuts)
				.find((s) => s.label === "Redo a marker change")!.keys;
		expect(redo(true)).toEqual([["⌘", "⇧", "Z"]]);
		expect(redo(false)).toEqual([
			["Ctrl", "⇧", "Z"],
			["Ctrl", "Y"],
		]);
	});

	it("labels the command key for the platform", () => {
		const selectAll = (apple: boolean) =>
			reviewShortcutGroups({ share: false, apple })
				.flatMap((group) => group.shortcuts)
				.find((s) => s.label === "Select all markers")!.keys;
		expect(selectAll(true)).toEqual([["⌘", "A"]]);
		expect(selectAll(false)).toEqual([["Ctrl", "A"]]);
	});
});
