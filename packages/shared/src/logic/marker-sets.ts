// Marker sets are backups of the markers, taken before every plugin action that changes them (push,
// pull, delete all, restore). A set holds both sides as they were before the action: the NLE's
// markers (as the plugin's bridge reports them) and the export's markers in PostPin. JSON in the
// database, so the format carries a version.

export const MARKER_SET_FORMAT = 1;

/** A marker as the NLE reported it, see plugin-core's NleMarker */
export interface NleMarkerSnapshotEntry {
	nleId: string | null;
	title: string;
	description: string;
	/** absolute timeline frame */
	frame: number;
	duration?: number;
	color: string;
	customData: string | null;
}

export interface NleMarkerSnapshot {
	format: number;
	markers: NleMarkerSnapshotEntry[];
}

export interface PostPinResponseSnapshot {
	id: string;
	content: string;
	authorId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface PostPinPointerSnapshot {
	id: string;
	kind: "ARROW" | "RECT";
	x: number;
	y: number;
	width: number | null;
	height: number | null;
	color: string;
	createdAt: string;
}

/** A marker of the export with everything needed to bring it back when it was deleted since */
export interface PostPinMarkerSnapshotEntry {
	id: string;
	name: string;
	description: string | null;
	frame: number;
	duration: number;
	categoryId: string;
	/** to find or recreate the category when it is gone by the time of a restore */
	categoryName: string;
	categoryColor: string;
	nleId: string | null;
	nleTimelineId: string | null;
	syncHash: string | null;
	authorId: string | null;
	guestId: string | null;
	createdAt: string;
	responses: PostPinResponseSnapshot[];
	pointers: PostPinPointerSnapshot[];
}

export interface PostPinMarkerSnapshot {
	format: number;
	markers: PostPinMarkerSnapshotEntry[];
}

/** How many markers an action added, changed and removed on one side */
export interface MarkerSetSideSummary {
	added: number;
	updated: number;
	removed: number;
}

/** What an action changed: the NLE's markers, PostPin's, or both */
export interface MarkerSetSummary {
	nle?: MarkerSetSideSummary;
	postpin?: MarkerSetSideSummary;
}

export const nleSnapshot = (markers: NleMarkerSnapshotEntry[]): NleMarkerSnapshot => ({
	format: MARKER_SET_FORMAT,
	markers,
});

/** Whether a summary side changed anything */
export const changedAny = (side: MarkerSetSideSummary | undefined) =>
	!!side && side.added + side.updated + side.removed > 0;
