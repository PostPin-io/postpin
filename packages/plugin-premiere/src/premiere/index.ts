import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import { getActive } from "./active";
import * as markers from "./markers";
import { PALETTE } from "./palette";
import { renderPreview } from "./render";
import { buildTimelineSnapshot } from "./snapshot";
import { getTiming } from "./time";

export function createPremiereBridge(): NleBridge {
	return {
		getCapabilities: async () => ({
			hostName: "Premiere Pro",
			palette: PALETTE,
			renderPresets: false,
			renderToDisk: false,
			snapshotClips: true,
			customMarkerData: false,
		}),
		getProjectId: async () => (await getActive()).project.guid.toString(),
		// No thumbnail: Exporter.exportSequenceFrame makes Premiere show a message every time
		getTimelineInfo: async () => {
			try {
				const { project, sequence } = await getActive();
				return {
					id: sequence.guid.toString(),
					name: sequence.name,
					projectId: project.guid.toString(),
					projectName: project.name.replace(/\.prproj$/i, ""),
				};
			} catch {
				return null;
			}
		},
		getMarkers: async () => {
			const { sequence } = await getActive();
			return markers.getMarkers(sequence, await getTiming(sequence));
		},
		setMarkers: async (list) => {
			const { project, sequence } = await getActive();
			return markers.setMarkers(project, sequence, await getTiming(sequence), list);
		},
		clearMarkers: async () => {
			const { project, sequence } = await getActive();
			await markers.clearMarkers(project, sequence);
		},
		getRenderPresets: async () => [],
		renderPreview: async (onProgress) => renderPreview((await getActive()).sequence, onProgress),
		buildTimelineSnapshot: async () => {
			const { sequence } = await getActive();
			return buildTimelineSnapshot(sequence, await getTiming(sequence));
		},
	};
}
