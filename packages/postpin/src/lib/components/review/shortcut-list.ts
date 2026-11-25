import { commandKeyLabel } from "#lib/keyboard.ts";

export type Shortcut = {
	/** Key combinations that do the same, each one a list of keys pressed together */
	keys: string[][];
	label: string;
};

export type ShortcutGroup = { title: string; shortcuts: Shortcut[] };

/**
 * The review page's shortcuts, for the shortcuts modal in the account menu. Keep in sync with handleReviewShortcut, the
 * MarkerPanel and the PointerSelector, which handle them. Copy and paste are team only.
 */
export function reviewShortcutGroups({
	share,
	apple,
}: {
	share: boolean;
	apple?: boolean;
}): ShortcutGroup[] {
	const cmd = commandKeyLabel(apple).replace(/\+$/, "");
	return [
		{
			title: "Playback",
			shortcuts: [
				{ keys: [["Space"]], label: "Play / pause" },
				{ keys: [["+"], ["-"]], label: "Faster / slower" },
				{ keys: [["F"]], label: "Fullscreen" },
			],
		},
		{
			title: "Navigation",
			shortcuts: [
				{ keys: [["←"], ["→"]], label: "Previous / next marker" },
				{ keys: [["↑"], ["↓"]], label: "Previous / next cut" },
				{
					keys: [
						[cmd, "←"],
						[cmd, "→"],
					],
					label: "One frame back / forward",
				},
				{
					keys: [
						[cmd, "⇧", "←"],
						[cmd, "⇧", "→"],
					],
					label: "One second back / forward",
				},
				{ keys: [["Home"], ["End"]], label: "Start / end" },
			],
		},
		{
			title: "Markers",
			shortcuts: [
				{ keys: [["M"]], label: "New marker" },
				{ keys: [["I"], ["O"]], label: "Set in / out point for the next marker" },
				{ keys: [["C"], ["⇧", "X"]], label: "Clear in and out" },
				{ keys: [["⌥", "Drag"]], label: "Drag a marker into a range, or resize a range" },
				{ keys: [["P"]], label: "Draw on the frame" },
				{ keys: [[cmd, "A"]], label: "Select all markers" },
				{ keys: [["Esc"]], label: "Clear the selection" },
				{ keys: [[cmd, "⌫"]], label: "Delete selected markers" },
				...(share
					? []
					: [
							{ keys: [[cmd, "C"]], label: "Copy selected markers" },
							{ keys: [[cmd, "X"]], label: "Cut selected markers" },
							{ keys: [[cmd, "V"]], label: "Paste markers at the playhead" },
						]),
			],
		},
		{
			title: "Timeline",
			shortcuts: [{ keys: [[cmd, "Scroll"]], label: "Zoom" }],
		},
		{
			title: "Help",
			shortcuts: [{ keys: [["?"]], label: "Show this list" }],
		},
	];
}
