// FilmCraft (ArtCraft's Premiere-style editor) over its desktop control channel, see control.ts.
// Experimental: FilmCraft is alpha and its protocol has no version, so command names and result
// shapes follow its main branch as of 2026-11.

import type { NleBridge, NleMarker, SetMarkerResult } from "@postpin-io/plugin-core/bridge";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execute, FilmCraftError } from "./control";
import {
	buildSnapshot,
	frameAtTick,
	markerIdOf,
	markerNleId,
	PALETTE,
	paletteIdOf,
	parseFrameRate,
	readOtio,
	type InspectedSequence,
	type OtioInfo,
} from "./convert";

interface InspectedProject {
	name: string;
	path: string | null;
	revision: number;
	activeSequence: number | null;
}

interface Job {
	id: number;
	progress: number;
	etaSeconds: number | null;
	finished: boolean;
	result: { error?: string; path?: string } | null;
}

const inspectProject = () => execute<InspectedProject>("project.inspect");
const inspectSequence = (item: number) => execute<InspectedSequence>("sequence.inspect", { item });

async function activeSequence(): Promise<{ project: InspectedProject; seq: InspectedSequence }> {
	const project = await inspectProject();
	if (project.activeSequence === null) {
		throw new FilmCraftError("Open a sequence in FilmCraft first");
	}
	return { project, seq: await inspectSequence(project.activeSequence) };
}

// The OTIO export is the only place the sequence's start timecode shows up, so it's cached per
// project revision (every edit counts it up)
let otioCache: { key: string; info: Promise<OtioInfo> } | null = null;

function otioInfo(project: InspectedProject, sequenceId: number): Promise<OtioInfo> {
	const key = `${project.path ?? project.name}|${project.revision}|${sequenceId}`;
	if (otioCache?.key !== key) {
		const info = exportOtio(sequenceId);
		otioCache = { key, info };
		info.catch(() => {
			if (otioCache?.key === key) otioCache = null;
		});
	}
	return otioCache.info;
}

async function exportOtio(sequenceId: number): Promise<OtioInfo> {
	const file = path.join(os.tmpdir(), `postpin-filmcraft-${randomUUID()}.otio`);
	try {
		await execute("file.exportOtio", { path: file, sequence: sequenceId });
		const otio: unknown = JSON.parse(await readFile(file, "utf8"));
		// target_url is relative to the export's folder
		const base = pathToFileURL(path.dirname(file) + path.sep);
		return readOtio(otio, (url) => {
			try {
				const resolved = new URL(url, base);
				return resolved.protocol === "file:" ? fileURLToPath(resolved) : null;
			} catch {
				return null;
			}
		});
	} finally {
		await rm(file, { force: true });
	}
}

async function timing() {
	const { project, seq } = await activeSequence();
	const otio = await otioInfo(project, seq.id);
	const frameRate = parseFrameRate(seq.settings.frame_rate, seq.settings.drop_frame);
	return { project, seq, otio, frameRate, startFrame: otio.startTimecode };
}

// A project saved under a new name counts as a new project, FilmCraft has no stable project id
function projectIdOf(project: InspectedProject) {
	if (!project.path) throw new FilmCraftError("Save the FilmCraft project first");
	return project.path;
}

let rendering = false;

async function renderPreview(onProgress: Parameters<NleBridge["renderPreview"]>[0]) {
	if (rendering) throw new FilmCraftError("FilmCraft is already rendering");
	rendering = true;
	try {
		const { project } = await activeSequence();
		const file = path.join(os.tmpdir(), `postpin-preview-${Date.now()}.mp4`);
		onProgress({ percent: 0, estimatedTimeRemainingMs: 0 });
		const started = await execute<{ job: number; path?: string }>("file.exportMedia", {
			path: file,
			sequence: project.activeSequence,
			format: "h264",
			range: "entire",
		});
		for (;;) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			const job = (await execute<Job[]>("jobs.list")).find((entry) => entry.id === started.job);
			if (!job) throw new FilmCraftError("FilmCraft's export job disappeared");
			if (job.finished) {
				if (job.result?.error)
					throw new FilmCraftError(`FilmCraft export failed: ${job.result.error}`);
				onProgress({ percent: 100, estimatedTimeRemainingMs: 0 });
				return started.path ?? job.result?.path ?? file;
			}
			onProgress({
				percent: Math.round(job.progress * 100),
				estimatedTimeRemainingMs: Math.round((job.etaSeconds ?? 0) * 1000),
			});
		}
	} finally {
		rendering = false;
	}
}

async function setMarkers(list: NleMarker[]): Promise<SetMarkerResult[]> {
	const { seq, startFrame } = await timing();
	const existing = new Set(seq.markers.map((marker) => marker.id));
	const results: SetMarkerResult[] = [];
	// One at a time: each is its own undo step and changes the sequence
	for (const marker of list) {
		try {
			const frame = marker.frame - startFrame;
			if (frame < 0) throw new FilmCraftError("The marker is before the start of the sequence");
			const fields = {
				name: marker.title,
				comment: marker.description,
				color: PALETTE.some((color) => color.id === marker.color) ? marker.color : "Green",
				frame,
				...(marker.duration !== undefined && { durationFrames: marker.duration }),
			};
			const id = markerIdOf(marker.nleId, seq.id);
			if (id !== null && existing.has(id)) {
				await execute("markers.edit", {
					target: "program",
					sequence: seq.id,
					marker: id,
					...fields,
				});
				results.push({ nleId: markerNleId(seq.id, id) });
			} else {
				const added = await execute<{ marker: number }>("markers.add", {
					target: "program",
					durationFrames: 0,
					...fields,
				});
				results.push({ nleId: markerNleId(seq.id, added.marker) });
			}
		} catch (err) {
			results.push({ nleId: null, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return results;
}

async function deleteMarkers(seq: InspectedSequence, ids: number[]) {
	if (ids.length === 0) return;
	await execute("markers.delete", { target: "program", sequence: seq.id, markers: ids });
}

export function createFilmCraftAdapter(): NleBridge {
	return {
		getCapabilities: async () => ({
			hostName: "FilmCraft",
			palette: PALETTE,
			renderPresets: false,
			renderToDisk: false,
			snapshotClips: true,
			customMarkerData: false,
		}),
		getProjectId: async () => projectIdOf(await inspectProject()),
		getTimelineInfo: async () => {
			const project = await inspectProject();
			if (project.activeSequence === null) return null;
			const { seq, startFrame } = await timing();
			return {
				id: String(seq.id),
				name: seq.name ?? "",
				projectId: projectIdOf(project),
				projectName: project.name,
				startFrame,
			};
		},
		getMarkers: async () => {
			const { seq, frameRate, startFrame } = await timing();
			return seq.markers.map((marker): NleMarker => ({
				nleId: markerNleId(seq.id, marker.id),
				title: marker.name,
				description: marker.comment,
				frame: startFrame + frameAtTick(marker.start, frameRate),
				duration: frameAtTick(marker.duration, frameRate),
				color: paletteIdOf(marker.color),
				customData: null,
			}));
		},
		setMarkers,
		removeMarkers: async (nleIds) => {
			const { seq } = await activeSequence();
			const present = new Set(seq.markers.map((marker) => marker.id));
			const ids = nleIds
				.map((nleId) => markerIdOf(nleId, seq.id))
				.filter((id): id is number => id !== null && present.has(id));
			await deleteMarkers(seq, ids);
		},
		clearMarkers: async () => {
			const { seq } = await activeSequence();
			await deleteMarkers(
				seq,
				seq.markers.map((marker) => marker.id),
			);
		},
		getRenderPresets: async () => [],
		renderPreview,
		// Capabilities.renderToDisk is false, so the UI never offers it
		renderToDisk: async () => {
			throw new FilmCraftError("FilmCraft can't render to disk from PostPin yet");
		},
		buildTimelineSnapshot: async () => {
			const { seq, otio } = await timing();
			return buildSnapshot(seq, otio);
		},
	};
}
