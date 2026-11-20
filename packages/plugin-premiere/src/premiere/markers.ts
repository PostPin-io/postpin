import type { Action, Marker, Project, Sequence } from "@adobe/premierepro";
import type { NleMarker, SetMarkerResult } from "@postpin-io/plugin-core/bridge";
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
	void pruneMarkerData(sequence, markers, data);
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

// Forgets the custom data of the sequence's deleted markers, so the store doesn't keep growing
async function pruneMarkerData(
	sequence: Sequence,
	markers: Marker[],
	data: Record<string, string>,
) {
	const prefix = `${sequence.guid.toString()}:`;
	const alive = new Set(markers.map((m) => dataKey(sequence, m.guid.toString())));
	const stale = Object.keys(data).filter((key) => key.startsWith(prefix) && !alive.has(key));
	if (stale.length === 0) return;
	await markerData.replace((current) => {
		const next = { ...current };
		for (const key of stale) delete next[key];
		return next;
	});
}

// New markers are added under a unique placeholder name, so each can be found again for its guid
// (Premiere doesn't return it), and get their real name with their color afterwards
const placeholderName = (run: string, i: number) => `PostPin new marker ${run}-${i}`;

export async function setMarkers(
	project: Project,
	sequence: Sequence,
	timing: Timing,
	list: NleMarker[],
): Promise<SetMarkerResult[]> {
	const markers = await ppro.Markers.getMarkers(sequence);
	const existing = new Map(markers.getMarkers().map((m) => [m.guid.toString(), m]));
	const run = Math.random().toString(36).slice(2, 8);

	transact(project, "PostPin: Sync markers", (add) => {
		list.forEach((marker, i) => {
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
						placeholderName(run, i),
						ppro.Marker.MARKER_TYPE_COMMENT,
						start,
						framesToTickTime(marker.duration ?? 0, timing),
						marker.description,
					),
				);
			}
		});
	});

	const fresh = new Map(
		(await listMarkers(sequence))
			.filter((m) => !existing.has(m.guid.toString()))
			.map((m) => [m.getName(), m]),
	);
	const created: { marker: Marker; name: string; color: number }[] = [];
	const results = list.map((marker, i): SetMarkerResult => {
		if (marker.nleId && existing.has(marker.nleId)) return { nleId: marker.nleId };
		const found = fresh.get(placeholderName(run, i));
		if (!found) return { nleId: null, error: "Premiere Pro didn't create the marker" };
		created.push({ marker: found, name: marker.title, color: Number(marker.color) });
		return { nleId: found.guid.toString() };
	});

	// The add action can't set a color. The markers exist either way, so they keep their ids.
	if (created.length > 0) {
		try {
			transact(project, "PostPin: Marker names and colors", (add) => {
				for (const { marker, name, color } of created) {
					add(marker.createSetNameAction(name));
					add(marker.createSetColorByIndexAction(color));
				}
			});
		} catch (err) {
			const error = `added, but without its name and color (${err instanceof Error ? err.message : err})`;
			const ids = new Set(created.map(({ marker }) => marker.guid.toString()));
			for (const result of results) if (result.nleId && ids.has(result.nleId)) result.error = error;
		}
	}

	const data: Record<string, string> = {};
	list.forEach((marker, i) => {
		const nleId = results[i]!.nleId;
		if (nleId && marker.customData) data[dataKey(sequence, nleId)] = marker.customData;
	});
	await markerData.update(data);
	return results;
}

export async function removeMarkers(project: Project, sequence: Sequence, nleIds: string[]) {
	const markers = await ppro.Markers.getMarkers(sequence);
	const wanted = new Set(nleIds);
	const doomed = markers.getMarkers().filter((m) => wanted.has(m.guid.toString()));
	if (doomed.length === 0) return;
	transact(project, "PostPin: Delete markers", (add) => {
		for (const marker of doomed) add(markers.createRemoveMarkerAction(marker));
	});
}

export async function clearMarkers(project: Project, sequence: Sequence) {
	const markers = await ppro.Markers.getMarkers(sequence);
	const all = markers.getMarkers();
	if (all.length === 0) return;
	transact(project, "PostPin: Delete markers", (add) => {
		for (const marker of all) add(markers.createRemoveMarkerAction(marker));
	});
}
