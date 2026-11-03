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
		getTimelineInfo: async () => {
			const sessionIds = await getSessionIds();
			return {
				id: sessionIds.originId,
				name: "ToDo",
				projectId: sessionIds.originId,
				projectName: "ToDo",
			};
		},
		getMarkers: async () =>
			markers.getMarkers(await getSessionTiming(), (await getSessionIds()).originId),
		setMarkers: async (list) => {
			const { originId } = await getSessionIds();
			const numbers = await markers.setMarkers(await getSessionTiming(), originId, list);
			return numbers.map((number) => markers.markerId(originId, number));
		},
		clearMarkers: () => markers.clearMarkers(),
		getRenderPresets: async () => [],
		renderPreview: async (onProgress) => renderPreview(await getSessionTiming(), onProgress),
		buildTimelineSnapshot: async () => buildTimelineSnapshot(await getSessionTiming()),
	};
}
