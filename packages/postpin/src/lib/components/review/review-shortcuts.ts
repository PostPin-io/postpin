import { isInsideOverlay, isPlainKey, isTypingTarget } from "#lib/keyboard.ts";

/** What the shortcuts act on. Missing parts (no timeline on a share link) just do nothing. */
export type ReviewShortcutTargets = {
	timeline?: {
		stepFrames(direction: -1 | 1, bySecond: boolean): void;
		seekToAdjacentMarker(direction: -1 | 1): void;
		seekToCut(direction: -1 | 1): void;
		seekToStart(): void;
		seekToEnd(): void;
		changePlaybackRate(direction: -1 | 1): void;
	};
	player?: { toggleFullscreen(): void };
	togglePlayback(): void;
};

/**
 * Single global keyboard handler for review pages. Works wherever focus is, except while
 * typing or inside modals. Components with their own shortcuts (MarkerPanel) skip the same targets.
 */
export function handleReviewShortcut(
	event: KeyboardEvent,
	{ timeline, player, togglePlayback }: ReviewShortcutTargets,
) {
	if (event.defaultPrevented || !isPlainKey(event, { allowMeta: true })) return;
	if (isTypingTarget(event) || isInsideOverlay(event)) return;

	switch (event.key) {
		case " ":
			// preventDefault also stops the native click on a focused button
			if (event.repeat || event.metaKey) return;
			togglePlayback();
			break;
		case "ArrowLeft":
			if (event.metaKey) timeline?.stepFrames(-1, event.shiftKey);
			else timeline?.seekToAdjacentMarker(-1);
			break;
		case "ArrowRight":
			if (event.metaKey) timeline?.stepFrames(1, event.shiftKey);
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
			if (event.metaKey || event.repeat) return;
			player?.toggleFullscreen();
			break;
		case "+":
		case "-":
			if (event.metaKey) return;
			timeline?.changePlaybackRate(event.key === "+" ? 1 : -1);
			break;
		default:
			return;
	}
	event.preventDefault();
}
