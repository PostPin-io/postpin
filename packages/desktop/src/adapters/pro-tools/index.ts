import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import * as markers from "./markers";
import { getMarkerPalette } from "./palette";
import { renderPreview } from "./render";
import { getSessionIds, getSessionTiming } from "./session";
import { buildTimelineSnapshot } from "./snapshot";

export function createProToolsAdapter(): NleBridge {
	return {
		getCapabilities: async () => ({
			hostName: "Pro Tools",
			palette: await getMarkerPalette(),
			renderPresets: false,
			renderToDisk: false,
			snapshotClips: false,
			customMarkerData: false,
		}),
		// A session is both project and timeline; origin_id survives Save As
		getProjectId: async () => (await getSessionIds()).originId,
		getTimelineId: async () => (await getSessionIds()).originId,
		getMarkers: async () => markers.getMarkers(await getSessionTiming()),
		setMarkers: async (list) => {
			await markers.setMarkers(await getSessionTiming(), list);
		},
		clearMarkers: () => markers.clearMarkers(),
		getRenderPresets: async () => [],
		renderPreview: async (onProgress) => renderPreview(await getSessionTiming(), onProgress),
		buildTimelineSnapshot: async () => buildTimelineSnapshot(await getSessionTiming()),
	};
}
