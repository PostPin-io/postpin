const TYPING_SELECTOR = "input, textarea, select, [contenteditable]";
const OVERLAY_SELECTOR = "dialog[open], [role='dialog'], [role='menu'], [role='listbox']";

/** True while the user is entering text, where shortcuts must not fire. */
export function isTypingTarget(event: KeyboardEvent): boolean {
	const target = event.target;
	return target instanceof Element && target.closest(TYPING_SELECTOR) !== null;
}

/** True inside modals/menus, which own their keyboard interaction. */
export function isInsideOverlay(event: KeyboardEvent): boolean {
	const target = event.target;
	return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}

/** Key press without Ctrl/Alt/Meta (Shift is allowed; Meta only with `allowMeta`). */
export function isPlainKey(event: KeyboardEvent, { allowMeta = false } = {}): boolean {
	return !event.ctrlKey && !event.altKey && (allowMeta || !event.metaKey);
}
