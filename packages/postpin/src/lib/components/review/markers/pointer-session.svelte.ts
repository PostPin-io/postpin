import { getContext, setContext } from "svelte";
import type { FrameRange } from "@postpin-io/shared/logic/ranges";

/**
 * Pointer state shared by the marker editor (list, draw button) and the picture overlay, which
 * live in different panes of the review.
 */
export class PointerSession {
	/** The marker the next pointer goes to while the picture is in drawing mode */
	drawingMarkerId = $state<string | null>(null);
	/** Hovered in the pointer list: stands out on the picture */
	highlightedId = $state<string | null>(null);
	/** Clicked on the picture or in the list: shows its handles, Delete removes it */
	selectedId = $state<string | null>(null);

	/** @param reveal brings the picture to the marker (seek, pause), so its pointers are visible */
	constructor(private reveal: (marker: FrameRange) => void) {}

	startDrawing(marker: FrameRange & { id: string }) {
		this.reveal(marker);
		this.selectedId = null;
		this.drawingMarkerId = marker.id;
	}

	stopDrawing() {
		this.drawingMarkerId = null;
	}

	/** Shows a pointer from the list on the picture */
	show(marker: FrameRange, pointerId: string) {
		this.reveal(marker);
		this.selectedId = pointerId;
	}
}

const KEY = Symbol("pointers");

export function setPointerSession(session: PointerSession) {
	setContext(KEY, session);
}

/** Undefined outside a review (e.g. a marker editor rendered on its own) */
export function usePointerSession(): PointerSession | undefined {
	return getContext<PointerSession | undefined>(KEY);
}
