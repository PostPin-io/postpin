// The undo history of the web app: every marker action stores the markers it touched as they were
// before and after it. Undo brings the "before" state back, redo the "after" state. Only those
// markers count; everything else on the export stays as it is.

import type { PostPinMarkerSnapshotEntry } from "./marker-sets.ts";

export const MARKER_STATE_FORMAT = 1;

/** A marker as one side of a step has it. Its export is part of it: a cut moves markers. */
export interface MarkerStateEntry extends PostPinMarkerSnapshotEntry {
	exportId: string;
}

/** The markers of a step's scope; an id of the scope that's missing here doesn't exist then */
export interface MarkerState {
	format: number;
	markers: MarkerStateEntry[];
}

/** Steps older than this are deleted, and a user keeps no more than MAX_UNDO_STEPS */
export const UNDO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_UNDO_STEPS = 100;
/** Edits of the same marker's text this close together are one step */
export const COALESCE_MS = 60_000;

const fieldsOf = (m: MarkerStateEntry) => ({
	exportId: m.exportId,
	name: m.name,
	description: m.description ?? "",
	frame: m.frame,
	duration: m.duration,
	categoryId: m.categoryId,
});

const extrasOf = (m: MarkerStateEntry) => ({
	responses: m.responses.map((r) => r.id).sort(),
	pointers: m.pointers.map((p) => [p.id, p.x, p.y, p.width, p.height, p.color].join(":")).sort(),
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The markers of the scope that are no longer as the step left them (`expected`), so going to
 * `target` would overwrite someone else's change. Responses and pointers only count where the
 * marker would be deleted: everywhere else, going back keeps them.
 */
export function conflictingMarkers(
	scope: string[],
	current: MarkerState,
	expected: MarkerState,
	target: MarkerState,
): string[] {
	const byId = (state: MarkerState) => new Map(state.markers.map((m) => [m.id, m]));
	const now = byId(current);
	const then = byId(expected);
	const wanted = byId(target);
	return scope.filter((id) => {
		const a = now.get(id);
		const b = then.get(id);
		if (!a || !b) return !!a !== !!b;
		if (!same(fieldsOf(a), fieldsOf(b))) return true;
		return !wanted.has(id) && !same(extrasOf(a), extrasOf(b));
	});
}

/** Whether the action changed anything at all; a step without changes isn't stored */
export function changedState(scope: string[], before: MarkerState, after: MarkerState) {
	return conflictingMarkers(scope, after, before, after).length > 0;
}

/** The exports a state's markers are in */
export const exportsOf = (...states: MarkerState[]) => [
	...new Set(states.flatMap((s) => s.markers.map((m) => m.exportId))),
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Delete 3 markers", "Move marker" for the toast after an undo or redo */
export function stepLabel(action: UndoAction, count: number) {
	const markers = count === 1 ? "marker" : plural(count, "marker");
	switch (action) {
		case "CREATE":
			return `Add ${markers}`;
		case "UPDATE":
			return `Edit ${markers}`;
		case "BATCH_UPDATE":
			return `Edit ${markers}`;
		case "DELETE":
			return `Delete ${markers}`;
		case "PASTE":
			return `Paste ${markers}`;
		case "CUT":
			return `Move ${markers}`;
	}
}

export type UndoAction = "CREATE" | "UPDATE" | "BATCH_UPDATE" | "DELETE" | "PASTE" | "CUT";
