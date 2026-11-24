// Resolve markers have no id and are keyed by frame, so moving one changes its key. Instead, each
// marker gets a generated id in its custom data, which moves with it, together with the frame it
// was last seen at: {"__postpin": 1, "nleId": "<uuid>", "frame": 120, ...}, see plugin-core's
// customData.ts for the format. Custom data is ours when it's empty or PostPin's data. Anything else
// belongs to another tool and is never written, those markers fall back to an id from their frame.
//
// Copying a marker copies its custom data, so copies share the original's id. The marker at (or
// closest to) the last seen frame keeps it, the others get new ids and are new markers in PostPin.
//
// Two more fields work around Resolve's limits, both only valid while the marker stays where the
// plugin put it (frame unchanged):
// - pinnedFrame: Resolve takes one marker per frame, so a pulled marker whose frame was taken sits a
//   few frames later. pinnedFrame is its real (absolute) frame, which the plugin reports instead.
// - placeholderName: Resolve needs a name, so an untitled marker gets one. The plugin reports it
//   as untitled again.

import { parsePostPinData, stringifyPostPinData } from "@postpin-io/plugin-core/customData";

export interface ResolveMarkerData {
	// Resolve's frame key, relative to the timeline start
	frame: number;
	customData: string | null;
}

export interface MarkerWithId {
	frame: number;
	nleId: string;
	customData: string | null;
	// whether customData has to be written back to Resolve
	changed: boolean;
}

interface Parsed {
	frame: number;
	// null when the custom data belongs to another tool
	data: Record<string, unknown> | null;
	nleId: string | null;
	lastFrame: number | null;
}

export function assignMarkerIds(
	timelineId: string,
	markers: ResolveMarkerData[],
	newId: () => string = () => crypto.randomUUID(),
): MarkerWithId[] {
	const parsed: Parsed[] = markers.map(({ frame, customData }) => {
		const data = ownData(customData);
		return {
			frame,
			data,
			nleId: typeof data?.nleId === "string" ? data.nleId : null,
			lastFrame: typeof data?.frame === "number" ? data.frame : null,
		};
	});

	// Copies: keep the id on the marker closest to where it was last seen
	const copies = new Set<Parsed>();
	const byId = new Map<string, Parsed[]>();
	for (const m of parsed) {
		if (m.nleId) byId.set(m.nleId, [...(byId.get(m.nleId) ?? []), m]);
	}
	for (const group of byId.values()) {
		if (group.length < 2) continue;
		const lastFrame = group[0]?.lastFrame ?? 0;
		const distance = (m: Parsed) => Math.abs(m.frame - lastFrame);
		const original = group.reduce((best, m) => (distance(m) < distance(best) ? m : best));
		for (const m of group) if (m !== original) copies.add(m);
	}

	return parsed.map((m, i) => {
		const customData = markers[i]?.customData ?? null;
		if (!m.data) {
			// Not ours to write. The id then changes when the marker moves.
			return { frame: m.frame, nleId: `${timelineId}:${m.frame}`, customData, changed: false };
		}
		if (copies.has(m)) {
			// A copy starts fresh, without the identity it inherited (e.g. a PostPin marker id)
			const nleId = newId();
			return {
				frame: m.frame,
				nleId,
				customData: stringifyPostPinData({ nleId, frame: m.frame }),
				changed: true,
			};
		}
		const nleId = m.nleId ?? newId();
		const changed = m.nleId === null || m.lastFrame !== m.frame;
		// Moved by the user: the frame the plugin worked around no longer applies
		const moved = m.lastFrame !== null && m.lastFrame !== m.frame;
		const data = moved ? { ...m.data, pinnedFrame: undefined } : m.data;
		return {
			frame: m.frame,
			nleId,
			customData: changed ? stringifyPostPinData({ ...data, nleId, frame: m.frame }) : customData,
			changed,
		};
	});
}

/** The workaround fields for a marker the plugin writes, see the top of this file */
export interface PlacementData {
	pinnedFrame?: number;
	placeholderName?: string;
}

// Id and custom data for a marker the plugin creates at frame (relative to the timeline start).
// A marker that brings its id (restored from a backup) keeps it, unless another marker has it.
export function newMarkerData(
	timelineId: string,
	frame: number,
	customData: string | null,
	placement: PlacementData = {},
	isTaken: (nleId: string) => boolean = () => false,
	newId: () => string = () => crypto.randomUUID(),
) {
	const data = ownData(customData);
	if (!data) return { nleId: `${timelineId}:${frame}`, customData };
	const own = typeof data.nleId === "string" && !isTaken(data.nleId) ? data.nleId : null;
	const nleId = own ?? newId();
	return {
		nleId,
		customData: stringifyPostPinData({ ...data, ...placementFields(placement), nleId, frame }),
	};
}

// Undefined fields drop out of the JSON, so stale ones from earlier custom data disappear
const placementFields = ({ pinnedFrame, placeholderName }: PlacementData) => ({
	pinnedFrame,
	placeholderName,
});

/** What the plugin reports for a marker: its real frame and title, see PlacementData */
export function readPlacement(customData: string | null, frame: number, name: string) {
	const data = customData ? parsePostPinData(customData) : null;
	const unmoved = typeof data?.frame === "number" && data.frame === frame;
	return {
		pinnedFrame: unmoved && typeof data?.pinnedFrame === "number" ? data.pinnedFrame : null,
		untitled: typeof data?.placeholderName === "string" && data.placeholderName === name,
	};
}

// The custom data as an object when it's ours (empty or PostPin's data), null when it isn't
function ownData(customData: string | null): Record<string, unknown> | null {
	return customData ? parsePostPinData(customData) : {};
}

// The markers' ids without assigning or writing anything, e.g. to find markers to update
export function readMarkerIds<T extends ResolveMarkerData>(timelineId: string, markers: T[]) {
	const byId = new Map<string, T>();
	for (const marker of markers) {
		const data = marker.customData ? parsePostPinData(marker.customData) : null;
		const nleId = typeof data?.nleId === "string" ? data.nleId : `${timelineId}:${marker.frame}`;
		byId.set(nleId, marker);
	}
	return byId;
}

// Id and custom data when a pulled marker replaces an existing one at frame: it keeps the existing
// id, our own data is merged with the pulled one, another tool's data stays untouched
export function replacedMarkerData(
	timelineId: string,
	nleId: string,
	frame: number,
	existingCustomData: string | null,
	pulledCustomData: string | null,
	placement: PlacementData = {},
) {
	const existing = ownData(existingCustomData);
	if (!existing) return { nleId: `${timelineId}:${frame}`, customData: existingCustomData };
	const pulled = ownData(pulledCustomData) ?? {};
	return {
		nleId,
		customData: stringifyPostPinData({
			...existing,
			...pulled,
			...placementFields(placement),
			nleId,
			frame,
		}),
	};
}

// Resolve gives every marker a duration, a plain marker has 1. In PostPin that is a point marker
// (0), so a one-frame range becomes one too.
export function fromResolveDuration(duration: number) {
	return duration > 1 ? duration : 0;
}

// The duration to write: PostPin's, else the one the marker had in Resolve, at least 1
export function toResolveDuration(duration: number | undefined, existing: number | undefined) {
	return Math.max(duration ?? existing ?? 1, 1);
}
