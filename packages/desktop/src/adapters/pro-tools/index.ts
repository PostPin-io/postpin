import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import * as markers from "./markers";
import { getMarkerPalette } from "./palette";
import { renderPreview } from "./render";
import { getSessionFolderName, getSessionIds, getSessionName, getSessionTiming } from "./session";
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
			const [{ originId }, name, folderName, timing] = await Promise.all([
				getSessionIds(),
				getSessionName(),
				getSessionFolderName(),
				getSessionTiming(),
			]);
			return {
				id: originId,
				name,
				projectId: originId,
				// The session folder, which keeps its name when the session is saved under a new one
				projectName: folderName ?? name,
				startFrame: timing.startFrameIndex,
			};
		},
		getMarkers: async () =>
			markers.getMarkers(await getSessionTiming(), (await getSessionIds()).originId),
		setMarkers: async (list) => {
			const { originId } = await getSessionIds();
			const results = await markers.setMarkers(await getSessionTiming(), originId, list);
			return results.map((result) =>
				result.number === null
					? { nleId: null, error: result.error }
					: { nleId: markers.markerId(originId, result.number) },
			);
		},
		removeMarkers: async (nleIds) =>
			markers.removeMarkers((await getSessionIds()).originId, nleIds),
		clearMarkers: () => markers.clearMarkers(),
		getRenderPresets: async () => [],
		renderPreview: async (onProgress) => renderPreview(await getSessionTiming(), onProgress),
		// Capabilities.renderToDisk is false, so the UI never offers it
		renderToDisk: async () => {
			throw new Error("Pro Tools can't render to disk from PostPin yet");
		},
		buildTimelineSnapshot: async () => buildTimelineSnapshot(await getSessionTiming()),
	};
}
