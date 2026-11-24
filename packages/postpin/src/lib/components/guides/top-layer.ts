/**
 * A modal <dialog> sits in the browser's top layer and makes everything outside it inert: a guide
 * overlay in <body> would be hidden behind it and could not be clicked. So overlays move into the
 * open dialog they belong to, and back to <body> once it closes.
 */

/** The open modal dialog an element is in, else <body> */
export function layerOf(el: Element | null): HTMLElement {
	return el?.closest<HTMLDialogElement>("dialog[open]") ?? document.body;
}

/** The open modal dialog the user sees on top (the last one in the document), else <body> */
export function topLayer(): HTMLElement {
	const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
	return open[open.length - 1] ?? document.body;
}

/** Moves `node` into `target` if it isn't there yet */
export function moveInto(node: HTMLElement, target: HTMLElement) {
	if (node.parentElement !== target) target.appendChild(node);
}
