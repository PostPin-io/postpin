// Resolve markers have no id and are keyed by frame, so moving one changes its key. Instead, each
// marker gets a generated id in its custom data, which moves with it, together with the frame it
// was last seen at: {"__postpin": 1, "nleId": "<uuid>", "frame": 120, ...}, see plugin-core's
// customData.ts for the format. Custom data is ours when it's empty or PostPin's data. Anything else
// belongs to another tool and is never written, those markers fall back to an id from their frame.
//
// Copying a marker copies its custom data, so copies share the original's id. The marker at (or
// closest to) the last seen frame keeps it, the others get new ids and are new markers in PostPin.

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
		return {
			frame: m.frame,
			nleId,
			customData: changed ? stringifyPostPinData({ ...m.data, nleId, frame: m.frame }) : customData,
			changed,
		};
	});
}

// Id and custom data for a marker the plugin creates at frame (relative to the timeline start)
export function newMarkerData(
	timelineId: string,
	frame: number,
	customData: string | null,
	newId: () => string = () => crypto.randomUUID(),
) {
	const data = ownData(customData);
	if (!data) return { nleId: `${timelineId}:${frame}`, customData };
	const nleId = newId();
	return { nleId, customData: stringifyPostPinData({ ...data, nleId, frame }) };
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
) {
	const existing = ownData(existingCustomData);
	if (!existing) return { nleId: `${timelineId}:${frame}`, customData: existingCustomData };
	const pulled = ownData(pulledCustomData) ?? {};
	return { nleId, customData: stringifyPostPinData({ ...existing, ...pulled, nleId, frame }) };
}
