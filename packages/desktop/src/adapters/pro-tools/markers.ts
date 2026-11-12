import type { NleMarker } from "@postpin-io/plugin-core/bridge";
import {
	MarkerLocation,
	MemoryLocationReference,
	TimeProperties,
	type MemoryLocation,
} from "../../third-party/protools-sdk/dist/PTSL";
import { iterateAll } from "./pagination";
import { colorIndexOf } from "./palette";
import { send, type RequestOf } from "./ptsl";
import type { SessionTiming } from "./session";
import { frameToSamples, samplesToFrame } from "./time";

// All memory locations: markers, selections and plain locations
export function listMemoryLocations() {
	return iterateAll(
		(request) => send("GetMemoryLocations", request),
		(response) => response.memoryLocations,
	);
}

const MARKER_RULERS = new Set([
	MarkerLocation.MarkerLocation_MainRuler,
	MarkerLocation.MarkerLocation_NamedRuler,
]);

// PostPin's markers: plain markers, and range markers, which are selections on a marker ruler.
// Pro Tools puts every selection on a marker ruler unless it belongs to a track; those track
// selections are never read, written or deleted.
export function isMarkerLocation(location: MemoryLocation) {
	if (location.timeProperties === TimeProperties.TProperties_Marker) return true;
	return (
		location.timeProperties === TimeProperties.TProperties_Selection &&
		MARKER_RULERS.has(location.location)
	);
}

export async function listMarkerLocations() {
	return (await listMemoryLocations()).filter(isMarkerLocation);
}

// Pro Tools has no custom data field. Markers are recognized by their id instead,
// "<session origin id>:<memory location number>", which PostPin stores as the marker's nleId.
export const markerId = (originId: string, number: number) => `${originId}:${number}`;

export async function getMarkers(timing: SessionTiming, originId: string): Promise<NleMarker[]> {
	const locations = await listMarkerLocations();
	return Promise.all(
		locations.map(async (location) => {
			const frame = await samplesToFrame(location.startTime, timing);
			// A selection ends where its last frame ends, so the end is the frame after the range
			const isRange = location.timeProperties === TimeProperties.TProperties_Selection;
			const end = isRange ? await samplesToFrame(location.endTime, timing) : frame;
			return {
				nleId: markerId(originId, location.number),
				title: location.name,
				description: location.comments,
				frame,
				duration: Math.max(end - frame, 0),
				color: String(location.colorIndex),
				customData: null,
			};
		}),
	);
}

// The ruler Pro Tools puts markers on in new sessions
const DEFAULT_RULER = "Markers";
const DEFAULT_RULER_PLACE = {
	location: MarkerLocation.MarkerLocation_NamedRuler,
	trackName: DEFAULT_RULER,
};

interface Ruler {
	location: MarkerLocation;
	trackName: string;
}

// The ruler most markers are on. PTSL can't list rulers, and MarkerLocation_MainRuler puts markers
// on a ruler of its own ("Markers 2"), which Pro Tools may not draw until the rulers change.
function mostUsedRuler(locations: MemoryLocation[]): Ruler | null {
	const counts = new Map<string, { ruler: Ruler; count: number }>();
	for (const { location, trackName } of locations) {
		if (location !== MarkerLocation.MarkerLocation_NamedRuler) continue;
		const entry = counts.get(trackName) ?? { ruler: { location, trackName }, count: 0 };
		entry.count += 1;
		counts.set(trackName, entry);
	}
	return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.ruler ?? null;
}

// Writes the markers and returns their memory location numbers. Markers whose nleId is still in
// the session are edited in place and stay on their ruler, the others go on the most used ruler.
// Ranges are selections on a marker ruler: a track marker that becomes a range moves to the ruler.
export async function setMarkers(
	timing: SessionTiming,
	originId: string,
	markers: NleMarker[],
): Promise<number[]> {
	const allLocations = await listMemoryLocations();
	const markerLocations = allLocations.filter(isMarkerLocation);
	const existing = new Map(
		markerLocations.map((location) => [markerId(originId, location.number), location]),
	);
	// Without markers there is no ruler to copy, so try the default one
	let ruler = mostUsedRuler(markerLocations);
	// Numbers are shared by all memory locations, not just markers
	let next = Math.max(0, ...allLocations.map((location) => location.number));

	// One at a time, since each new marker takes the next number
	const numbers: number[] = [];
	for (const marker of markers) {
		const current = marker.nleId ? existing.get(marker.nleId) : undefined;
		const duration = marker.duration ?? (current ? await durationOf(current, timing) : 0);
		const samples = await frameToSamples(marker.frame, timing);
		const fields = {
			name: marker.title,
			comments: marker.description,
			startTime: samples,
			endTime: duration > 0 ? await frameToSamples(marker.frame + duration, timing) : samples,
			timeProperties:
				duration > 0 ? TimeProperties.TProperties_Selection : TimeProperties.TProperties_Marker,
			reference: MemoryLocationReference.MLReference_Absolute,
			colorIndex: colorIndexOf(marker.color),
		};
		if (current) {
			const place =
				duration > 0 && !MARKER_RULERS.has(current.location)
					? (ruler ?? DEFAULT_RULER_PLACE)
					: { location: current.location, trackName: current.trackName };
			await editMarker(current, { ...fields, ...place });
			numbers.push(current.number);
		} else {
			next += 1;
			ruler = await createMarker(next, fields, ruler);
			numbers.push(next);
		}
	}
	return numbers;
}

// The range length of a marker already in the session, for updates that leave it out
async function durationOf(location: MemoryLocation, timing: SessionTiming) {
	if (location.timeProperties !== TimeProperties.TProperties_Selection) return 0;
	const [start, end] = await Promise.all([
		samplesToFrame(location.startTime, timing),
		samplesToFrame(location.endTime, timing),
	]);
	return Math.max(end - start, 0);
}

type MarkerFields = Omit<Partial<RequestOf<"CreateMemoryLocation">>, "number">;

// Edits a marker in place, keeping its number and so its nleId. Pro Tools also switches between
// point marker and range this way.
async function editMarker(current: MemoryLocation, fields: MarkerFields) {
	await send("EditMemoryLocation", { number: current.number, ...fields });
}

// Creates a marker on the ruler and returns the ruler for the next ones. Without a known ruler it
// tries the default one; when that is missing, Pro Tools reports an error but still creates the
// marker on a ruler of its own, which then serves the following markers.
async function createMarker(
	number: number,
	fields: Omit<Partial<RequestOf<"CreateMemoryLocation">>, "number" | "location" | "trackName">,
	ruler: Ruler | null,
): Promise<Ruler> {
	if (ruler) {
		await send("CreateMemoryLocation", { number, ...fields, ...ruler });
		return ruler;
	}
	const fallback = DEFAULT_RULER_PLACE;
	try {
		await send("CreateMemoryLocation", { number, ...fields, ...fallback });
		return fallback;
	} catch (err) {
		const created = (await listMemoryLocations()).find((location) => location.number === number);
		if (created) return { location: created.location, trackName: created.trackName };
		await send("CreateMemoryLocation", {
			number,
			...fields,
			location: MarkerLocation.MarkerLocation_MainRuler,
		});
		const fromMainRuler = (await listMemoryLocations()).find((l) => l.number === number);
		if (!fromMainRuler) throw err;
		return { location: fromMainRuler.location, trackName: fromMainRuler.trackName };
	}
}

// Deletes the markers (ranges on marker rulers included) only, unlike ClearAllMemoryLocations, which
// also takes the user's other selections
export async function clearMarkers() {
	const numbers = (await listMarkerLocations()).map((location) => location.number);
	if (numbers.length === 0) return;

	const { failureList } = await send("ClearMemoryLocation", { locationList: numbers });
	if (failureList.length > 0) {
		throw new Error(`Pro Tools couldn't delete markers ${failureList.join(", ")}`);
	}
}
