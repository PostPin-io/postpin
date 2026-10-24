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

// TODO: Pro Tools has no custom data field. Instead of emulating it, the plan is to store
// `${originId}:${number}` as the PostPin marker's nleId on the server, see the sync discussion.
export async function getMarkers(timing: SessionTiming): Promise<NleMarker[]> {
	const locations = await listMarkerLocations();
	return Promise.all(
		locations.map(async (location) => ({
			title: location.name,
			description: location.comments,
			frame: await samplesToFrame(location.startTime, timing),
			color: String(location.colorIndex),
			customData: null,
		})),
	);
}

// Creates the markers on the main ruler and returns their memory location numbers
export async function setMarkers(timing: SessionTiming, markers: NleMarker[]): Promise<number[]> {
	// Numbers are shared by all memory locations, not just markers
	let number = Math.max(0, ...(await listMemoryLocations()).map((location) => location.number));

	// One at a time, since each marker takes the next number
	const numbers: number[] = [];
	for (const marker of markers) {
		const samples = await frameToSamples(marker.frame, timing);
		number += 1;
		await send("CreateMemoryLocation", {
			number,
			name: marker.title,
			comments: marker.description,
			startTime: samples,
			endTime: samples,
			timeProperties: TimeProperties.TProperties_Marker,
			reference: MemoryLocationReference.MLReference_Absolute,
			location: MarkerLocation.MarkerLocation_MainRuler,
			colorIndex: colorIndexOf(marker.color),
		});
		numbers.push(number);
	}
	return numbers;
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
