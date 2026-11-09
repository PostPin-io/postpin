import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import { createProToolsAdapter } from "./pro-tools";

export interface HostAdapter {
	id: string;
	// shown in the host picker
	name: string;
	create(): NleBridge;
}

export const ADAPTERS: HostAdapter[] = [
	{ id: "pro-tools", name: "Pro Tools", create: createProToolsAdapter },
];

// One bridge per host, created on first selection. Adapters keep connection state
// (e.g. the PTSL registration), so switching back reuses it.
const created = new Map<string, NleBridge>();
let selectedId: string | null = null;
// Calls that change the NLE or take long. Switching hosts meanwhile would send the rest of the
// work to the other host, reads are fine because the UI reloads after a switch.
let busyCalls = 0;

export function getSelectedHost(): string | null {
	return selectedId;
}

export function selectHost(id: string) {
	const adapter = ADAPTERS.find((a) => a.id === id);
	if (!adapter) throw new Error(`Unknown host ${id}`);
	if (busyCalls > 0 && id !== selectedId) {
		throw new Error("Wait for the current action to finish before switching programs");
	}
	if (!created.has(id)) created.set(id, adapter.create());
	selectedId = id;
}

function current(): NleBridge {
	const bridge = selectedId ? created.get(selectedId) : undefined;
	if (!bridge) throw new Error("No program selected");
	return bridge;
}

async function busy<T>(call: () => Promise<T>): Promise<T> {
	busyCalls++;
	try {
		return await call();
	} finally {
		busyCalls--;
	}
}

// Forwards every call to the selected host, so the window keeps one bridge across switches
export function createSwitchBridge(): NleBridge {
	return {
		getCapabilities: async () => current().getCapabilities(),
		getProjectId: async () => current().getProjectId(),
		getTimelineInfo: async () => current().getTimelineInfo(),
		getMarkers: async () => current().getMarkers(),
		setMarkers: (markers) => busy(() => current().setMarkers(markers)),
		clearMarkers: () => busy(() => current().clearMarkers()),
		getRenderPresets: async () => current().getRenderPresets(),
		renderPreview: (onProgress) => busy(() => current().renderPreview(onProgress)),
		buildTimelineSnapshot: async () => current().buildTimelineSnapshot(),
	};
}
