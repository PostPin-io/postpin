// REAPER over its web interface and a bridge script, see setup.ts and control.ts.
// A REAPER project is both project and timeline. Markers and regions are PostPin's markers and
// ranges; REAPER markers only have a name, so the description and custom data go into the
// project (ExtState per marker GUID), where they stay invisible but survive saving.

import type { NleBridge, SetMarkerResult } from "@postpin-io/plugin-core/bridge";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execute, executeRender, ReaperError } from "./control";
import {
	buildSnapshot,
	displayName,
	fpsOf,
	timingOf,
	toBridgeMarker,
	toNleMarker,
	videoRenderFormat,
	type BridgeMarker,
	type BridgeSnapshot,
	type ProjectInfo,
} from "./convert";

const getProject = () => execute<ProjectInfo>("project");

/** The folder the project is in, which keeps its name when the project is saved under a new one */
const folderName = (project: ProjectInfo) =>
	project.path ? path.basename(path.dirname(project.path)) : displayName(project);

async function renderPreview(onProgress: Parameters<NleBridge["renderPreview"]>[0]) {
	const project = await getProject();
	const { frameRate } = timingOf(project);
	const folder = os.tmpdir();
	const name = `postpin-preview-${randomUUID()}`;
	// REAPER can't report progress while it renders: 0 until it's done
	onProgress({ percent: 0, estimatedTimeRemainingMs: 0 });
	const { targets } = await executeRender<{ targets: string }>({
		folder,
		name,
		format: videoRenderFormat(fpsOf(frameRate)),
	});
	const file = targets.split(";")[0] || path.join(folder, `${name}.mp4`);
	onProgress({ percent: 100, estimatedTimeRemainingMs: 0 });
	return file;
}

export function createReaperAdapter(): NleBridge {
	return {
		getCapabilities: async () => ({
			hostName: "REAPER",
			palette: "rgb",
			renderPresets: false,
			renderToDisk: false,
			snapshotClips: true,
			// stored in the project, invisible in REAPER
			customMarkerData: true,
		}),
		getProjectId: async () => (await getProject()).id,
		getTimelineInfo: async () => {
			const project = await getProject();
			return {
				id: project.id,
				name: displayName(project),
				projectId: project.id,
				projectName: folderName(project),
				startFrame: timingOf(project).startFrame,
			};
		},
		getMarkers: async () => {
			const timing = timingOf(await getProject());
			const markers = await execute<BridgeMarker[]>("markers");
			return markers.map((marker) => toNleMarker(marker, timing));
		},
		setMarkers: async (list) => {
			const timing = timingOf(await getProject());
			const existing = new Set((await execute<BridgeMarker[]>("markers")).map((m) => m.guid));
			// REAPER takes times before the project start, but they aren't in the timeline
			const early = (frame: number) => frame < timing.startFrame;
			const valid = list.filter((marker) => !early(marker.frame));
			const results = await execute<({ guid: string } | { error: string })[]>(
				"setMarkers",
				valid.map((marker) => toBridgeMarker(marker, timing, existing)),
			);
			let next = 0;
			return list.map((marker): SetMarkerResult => {
				if (early(marker.frame)) {
					return { nleId: null, error: "The marker is before the start of the project" };
				}
				const result = results[next++];
				return "guid" in result ? { nleId: result.guid } : { nleId: null, error: result.error };
			});
		},
		removeMarkers: async (nleIds) => {
			await execute("removeMarkers", nleIds);
		},
		clearMarkers: async () => {
			await execute("clearMarkers");
		},
		getRenderPresets: async () => [],
		renderPreview,
		// Capabilities.renderToDisk is false, so the UI never offers it
		renderToDisk: async () => {
			throw new ReaperError("REAPER can't render to disk from PostPin yet");
		},
		buildTimelineSnapshot: async () => buildSnapshot(await execute<BridgeSnapshot>("snapshot")),
	};
}
