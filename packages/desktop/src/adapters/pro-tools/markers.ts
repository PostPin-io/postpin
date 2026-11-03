import type { NleMarker } from "@postpin-io/plugin-core/bridge";
import {
	MarkerLocation,
	MemoryLocationReference,
	TimeProperties,
} from "../../third-party/protools-sdk/dist/PTSL";
import { iterateAll } from "./pagination";
import { colorIndexOf } from "./palette";
import { send } from "./ptsl";
import type { SessionTiming } from "./session";
import { frameToSamples, samplesToFrame } from "./time";

// All memory locations: markers, selections and plain locations
export function listMemoryLocations() {
	return iterateAll(
		(request) => send("GetMemoryLocations", request),
		(response) => response.memoryLocations,
	);
}

// Memory locations that show as markers in the ruler
export async function listMarkerLocations() {
	return (await listMemoryLocations()).filter(
		(location) => location.timeProperties === TimeProperties.TProperties_Marker,
	);
}

// Pro Tools has no custom data field. Markers are recognized by their id instead,
// "<session origin id>:<memory location number>", which PostPin stores as the marker's nleId.
export const markerId = (originId: string, number: number) => `${originId}:${number}`;

export async function getMarkers(timing: SessionTiming, originId: string): Promise<NleMarker[]> {
	const locations = await listMarkerLocations();
	return Promise.all(
		locations.map(async (location) => ({
			nleId: markerId(originId, location.number),
			title: location.name,
			description: location.comments,
			frame: await samplesToFrame(location.startTime, timing),
			color: String(location.colorIndex),
			customData: null,
		})),
	);
}

// Writes the markers to the main ruler and returns their memory location numbers. Markers whose
// nleId is still in the session are edited in place, the others are created.
export async function setMarkers(
	timing: SessionTiming,
	originId: string,
	markers: NleMarker[],
): Promise<number[]> {
	const existing = new Set(
		(await listMarkerLocations()).map((location) => markerId(originId, location.number)),
	);
	// Numbers are shared by all memory locations, not just markers
	let next = Math.max(0, ...(await listMemoryLocations()).map((location) => location.number));

	// One at a time, since each new marker takes the next number
	const numbers: number[] = [];
	for (const marker of markers) {
		const samples = await frameToSamples(marker.frame, timing);
		const fields = {
			name: marker.title,
			comments: marker.description,
			startTime: samples,
			endTime: samples,
			timeProperties: TimeProperties.TProperties_Marker,
			reference: MemoryLocationReference.MLReference_Absolute,
			location: MarkerLocation.MarkerLocation_MainRuler,
			colorIndex: colorIndexOf(marker.color),
		};
		const number = marker.nleId && existing.has(marker.nleId) ? numberOf(marker.nleId) : null;
		if (number !== null) {
			await send("EditMemoryLocation", { number, ...fields });
			numbers.push(number);
		} else {
			next += 1;
			await send("CreateMemoryLocation", { number: next, ...fields });
			numbers.push(next);
		}
	}
	return numbers;
}

// The memory location number in a marker id
function numberOf(nleId: string) {
	return Number(nleId.slice(nleId.lastIndexOf(":") + 1));
}

// Deletes the markers only, unlike ClearAllMemoryLocations, which also takes the user's selections
export async function clearMarkers() {
	const numbers = (await listMarkerLocations()).map((location) => location.number);
	if (numbers.length === 0) return;

	const { failureList } = await send("ClearMemoryLocation", { locationList: numbers });
	if (failureList.length > 0) {
		throw new Error(`Pro Tools couldn't delete markers ${failureList.join(", ")}`);
	}
}
