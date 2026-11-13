import type { Action, Marker, Project, Sequence } from "@adobe/premierepro";
import type { NleMarker } from "@postpin-io/plugin-core/bridge";
import { createStore } from "../bridges/store";
import { ppro } from "../host";
import { framesToTickTime, ticksToFrames, toFrame, toTickTime, type Timing } from "./time";

// Premiere markers have no custom data field, so it's kept locally per sequence and marker guid.
// It's lost on another machine: pulled markers are then pushed as new ones.
const markerData = createStore<Record<string, string>>("marker-data.json", {});
const dataKey = (sequence: Sequence, nleId: string) => `${sequence.guid.toString()}:${nleId}`;

function transact(
	project: Project,
	undoName: string,
	build: (add: (action: Action) => void) => void,
) {
	let ok = false;
	project.lockedAccess(() => {
		ok = project.executeTransaction((compound) => build((a) => compound.addAction(a)), undoName);
	});
	if (!ok) throw new Error(`Premiere Pro rejected "${undoName}"`);
}

async function listMarkers(sequence: Sequence): Promise<Marker[]> {
	return (await ppro.Markers.getMarkers(sequence)).getMarkers();
}

export async function getMarkers(sequence: Sequence, timing: Timing): Promise<NleMarker[]> {
	const [markers, data] = await Promise.all([listMarkers(sequence), markerData.read()]);
	return markers.map((marker) => {
		const nleId = marker.guid.toString();
		return {
			nleId,
			title: marker.getName(),
			description: marker.getComments(),
			frame: toFrame(marker.getStart(), timing),
			duration: ticksToFrames(marker.getDuration(), timing),
			color: String(marker.getColorIndex()),
			customData: data[dataKey(sequence, nleId)] ?? null,
		};
	});
}

export async function setMarkers(
	project: Project,
	sequence: Sequence,
	timing: Timing,
	list: NleMarker[],
): Promise<string[]> {
	const markers = await ppro.Markers.getMarkers(sequence);
	const existing = new Map(markers.getMarkers().map((m) => [m.guid.toString(), m]));

	transact(project, "PostPin: Sync markers", (add) => {
		for (const marker of list) {
			const start = toTickTime(marker.frame, timing);
			const current = marker.nleId ? existing.get(marker.nleId) : undefined;
			if (current) {
				add(current.createSetNameAction(marker.title));
				add(current.createSetCommentsAction(marker.description));
				add(current.createSetColorByIndexAction(Number(marker.color)));
				add(markers.createMoveMarkerAction(current, start));
				// Left out: the marker keeps its length
				if (marker.duration !== undefined) {
					add(current.createSetDurationAction(framesToTickTime(marker.duration, timing)));
				}
			} else {
				add(
					markers.createAddMarkerAction(
						marker.title,
						ppro.Marker.MARKER_TYPE_COMMENT,
						start,
						framesToTickTime(marker.duration ?? 0, timing),
						marker.description,
					),
				);
			}
		}
	});

	// New markers get their guid from Premiere: find them as the unknown ones at their frame and title
	const fresh = (await listMarkers(sequence)).filter((m) => !existing.has(m.guid.toString()));
	const created: { marker: Marker; color: number }[] = [];
	const ids = list.map((marker) => {
		if (marker.nleId && existing.has(marker.nleId)) return marker.nleId;
		const index = fresh.findIndex(
			(m) => toFrame(m.getStart(), timing) === marker.frame && m.getName() === marker.title,
		);
		if (index < 0) throw new Error(`Premiere Pro didn't create the marker "${marker.title}"`);
		const [found] = fresh.splice(index, 1);
		created.push({ marker: found, color: Number(marker.color) });
		return found.guid.toString();
	});

	// The add action can't set a color
	if (created.length > 0) {
		transact(project, "PostPin: Marker colors", (add) => {
			for (const { marker, color } of created) add(marker.createSetColorByIndexAction(color));
		});
	}

	const data: Record<string, string> = {};
	list.forEach((marker, i) => {
		if (marker.customData) data[dataKey(sequence, ids[i])] = marker.customData;
	});
	await markerData.update(data);
	return ids;
}

export async function clearMarkers(project: Project, sequence: Sequence) {
	const markers = await ppro.Markers.getMarkers(sequence);
	const all = markers.getMarkers();
	if (all.length === 0) return;
	transact(project, "PostPin: Delete markers", (add) => {
		for (const marker of all) add(markers.createRemoveMarkerAction(marker));
	});
}
