import { describe, expect, it } from "vitest";
import { reviewShortcutGroups } from "#lib/components/review/shortcut-list.ts";

const labels = (share: boolean, apple = true) =>
	reviewShortcutGroups({ share, apple }).flatMap((group) => group.shortcuts.map((s) => s.label));

describe("reviewShortcutGroups", () => {
	it("leaves out copy and paste on share links, which are team only", () => {
		expect(labels(false)).toContain("Paste markers at the playhead");
		expect(labels(true)).not.toContain("Paste markers at the playhead");
		expect(labels(true)).toContain("New marker");
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
