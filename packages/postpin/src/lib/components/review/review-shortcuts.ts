import { hasCommandKey, isApplePlatform, isInsideOverlay, isTypingTarget } from "#lib/keyboard.ts";

/** What the shortcuts act on. Missing parts (no timeline on a share link) just do nothing. */
export type ReviewShortcutTargets = {
	timeline?: {
		stepFrames(direction: -1 | 1, bySecond: boolean): void;
		seekToAdjacentMarker(direction: -1 | 1): void;
		seekToCut(direction: -1 | 1): void;
		seekToStart(): void;
		seekToEnd(): void;
		changePlaybackRate(direction: -1 | 1): void;
		marks?: { markIn(): void; markOut(): void; clearMarks(): void };
	};
	player?: { toggleFullscreen(): void };
	togglePlayback(): void;
	/** Opens the list of all shortcuts */
	showShortcuts?(): void;
};

/**
 * Single global keyboard handler for review pages. Works wherever focus is, except while
 * typing or inside modals. Components with their own shortcuts (MarkerPanel) skip the same targets.
 */
export function handleReviewShortcut(
	event: KeyboardEvent,
	{ timeline, player, togglePlayback, showShortcuts }: ReviewShortcutTargets,
	{ apple = isApplePlatform() } = {},
) {
	if (event.defaultPrevented || event.altKey) return;
	// ⌘ on a Mac, Ctrl elsewhere (hasCommandKey). The other one is never a review shortcut.
	if (apple ? event.ctrlKey : event.metaKey) return;
	const cmd = hasCommandKey(event, apple);
	if (isTypingTarget(event) || isInsideOverlay(event)) return;

	switch (event.key) {
		case " ":
			// preventDefault also stops the native click on a focused button
			if (event.repeat || cmd) return;
			togglePlayback();
			break;
		case "ArrowLeft":
			if (cmd) timeline?.stepFrames(-1, event.shiftKey);
			else timeline?.seekToAdjacentMarker(-1);
			break;
		case "ArrowRight":
			if (cmd) timeline?.stepFrames(1, event.shiftKey);
			else timeline?.seekToAdjacentMarker(1);
			break;
		case "ArrowUp":
			timeline?.seekToCut(-1);
			break;
		case "ArrowDown":
			timeline?.seekToCut(1);
			break;
		case "Home":
			timeline?.seekToStart();
			break;
		case "End":
			timeline?.seekToEnd();
			break;
		case "f":
		case "F":
			if (cmd || event.repeat) return;
			player?.toggleFullscreen();
			break;
		case "+":
		case "-":
			if (cmd) return;
			timeline?.changePlaybackRate(event.key === "+" ? 1 : -1);
			break;
		case "i":
		case "I":
			if (cmd || event.repeat) return;
			timeline?.marks?.markIn();
			break;
		case "o":
		case "O":
			if (cmd || event.repeat) return;
			timeline?.marks?.markOut();
			break;
		case "c":
		case "C":
			if (cmd || event.repeat) return;
			timeline?.marks?.clearMarks();
			break;
		case "X":
		case "x":
			// deliberately only with Shift
			if (cmd || event.repeat || !event.shiftKey) return;
			timeline?.marks?.clearMarks();
			break;
		case "?":
			if (cmd || event.repeat) return;
			showShortcuts?.();
			break;
		default:
			return;
	}
	event.preventDefault();
}
