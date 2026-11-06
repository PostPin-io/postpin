import { vi } from "vitest";
import type { Capabilities, HostBridge, NleBridge, NleMarker } from "../src/bridge.ts";

export const RESOLVE_CAPABILITIES: Capabilities = {
	hostName: "Resolve",
	palette: [
		{ id: "Blue", hex: "#0000FF" },
		{ id: "Red", hex: "#FF0000" },
		{ id: "Green", hex: "#00FF00" },
	],
	renderPresets: true,
	renderToDisk: true,
	snapshotClips: true,
	customMarkerData: true,
};

/** An NLE bridge whose methods are all mocks; getMarkers/setMarkers keep markers in memory */
export function fakeNle(
	capabilities: Capabilities = RESOLVE_CAPABILITIES,
	markers: NleMarker[] = [],
) {
	const state = { markers: [...markers], nextId: 1 };
	const nle = {
		state,
		getCapabilities: vi.fn(async () => capabilities),
		getProjectId: vi.fn(async () => "nle-project"),
		getTimelineInfo: vi.fn(async () => ({
			name: "Cut 3",
			id: "nle-timeline",
			projectId: "nle-project",
			projectName: "Feature",
		})),
		getMarkers: vi.fn(async () => state.markers.map((m) => ({ ...m }))),
		setMarkers: vi.fn(async (written: NleMarker[]) =>
			written.map((m) => {
				const existing = m.nleId ? state.markers.find((e) => e.nleId === m.nleId) : undefined;
				if (existing) {
					Object.assign(existing, m);
					return existing.nleId!;
				}
				const nleId = `nle-${state.nextId++}`;
				state.markers.push({ ...m, nleId });
				return nleId;
			}),
		),
		clearMarkers: vi.fn(async () => {}),
		getRenderPresets: vi.fn(async () => []),
		renderPreview: vi.fn(async () => "/renders/cut3.mp4"),
		buildTimelineSnapshot: vi.fn(async () => ({ id: "nle-timeline" }) as never),
	} satisfies NleBridge & { state: unknown };
	return nle;
}

export function fakeHost() {
	return {
		getFileSize: vi.fn(async () => 100 * 1024 * 1024),
		uploadFile: vi.fn(async () => [{ partNumber: 1, etag: '"e1"' }]),
	} satisfies Partial<HostBridge>;
}
