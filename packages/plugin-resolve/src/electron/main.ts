// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security

import { app, BrowserWindow } from "electron";
import path from "path";
import os from "os";
// @ts-ignore
import WorkflowIntegrationModule from "./WorkflowIntegration.node";
import type {
	MarkerColor,
	MarkerInfo,
	MediaPoolItem,
	Project,
	ProjectManager,
	RenderSettings,
	Resolve,
	Timeline,
	TimelineItem,
	WorkflowIntegrationModule as WI,
} from "./resolve";
import { setTimeout as sleep } from "timers/promises";
import { stringifyPostPinData } from "@postpin-io/plugin-core/customData";
import { assignMarkerIds, newMarkerData, readMarkerIds, replacedMarkerData } from "./markerIds";
import { CLIP_PALETTE, MARKER_PALETTE } from "./palette";
import type {
	Clip,
	FrameRate,
	MediaItem,
	TimelineSnapshot,
	Track,
} from "@postpin-io/shared/types/TimelineSnapshot";
import type { NleBridge, NleMarker, RenderProgress } from "@postpin-io/plugin-core/bridge";
import { createWindow, exposeHostBridge, exposeNleBridge } from "@postpin-io/plugin-electron/main";

declare const DEV_SERVER_URL: string;
declare const DEFAULT_SERVER_URL: string;

const PLUGIN_ID = "io.postpin.plugin.resolve";
const CLIENT_ID = "io.postpin.plugin.resolve";

const WorkflowIntegration: WI = WorkflowIntegrationModule;

// Cached as promises, so concurrent first calls share one initialization of the native module.
// A failed (null) result isn't kept, so the next call tries again.
let resolvePromise: Promise<Resolve | null> | null = null;
let projectManagerPromise: Promise<ProjectManager | null> | null = null;

// Initialize Resolve interface and returns Resolve object.
async function initResolveInterface() {
	const isSuccess = await WorkflowIntegration.InitializePromise(PLUGIN_ID);
	if (!isSuccess) {
		console.log("Error: Failed to initialize Resolve interface!");
		return null;
	}

	// GetResolve() returns a blocking API: its calls never yield to the event loop, so IPC events
	// and window repaints stall until a long job finishes. The promise API runs calls asynchronously.
	const resolve = await WorkflowIntegration.GetResolvePromise();
	if (!resolve) {
		console.log("Error: Failed to get Resolve object!");
		return null;
	}

	return resolve;
}

// Cleanup Resolve interface.
function cleanup() {
	const isSuccess = WorkflowIntegration.CleanUp();
	if (!isSuccess) {
		console.log("Error: Failed to cleanup Resolve interface!");
	}

	resolvePromise = null;
	projectManagerPromise = null;
}

// Gets Resolve object.
function getResolve() {
	resolvePromise ??= initResolveInterface().then((resolve) => {
		if (!resolve) resolvePromise = null;
		return resolve;
	});
	return resolvePromise;
}

// Gets project manager object.
function getProjectManager() {
	projectManagerPromise ??= (async () => {
		const resolve = await getResolve();
		const projectManager = resolve ? ((await resolve.GetProjectManager()) ?? null) : null;
		if (!projectManager) {
			console.log("Error: Failed to get ProjectManager object!");
			projectManagerPromise = null;
		}
		return projectManager;
	})();
	return projectManagerPromise;
}

// Gets current project object.
async function getCurrentProject() {
	const projectManager = await getProjectManager();
	if (!projectManager) return null;

	const project = await projectManager.GetCurrentProject();
	if (!project) {
		console.log("Error: Failed to get current project object!");
	}

	return project;
}

async function getCurrentTimeline() {
	const project = await getCurrentProject();
	if (!project) throw new Error("No project open in Resolve");

	const timeline = await project.GetCurrentTimeline();
	if (!timeline) throw new Error("No timeline open in Resolve");

	return timeline;
}

// Resolve API calls can throw synchronously on an error response, so `.catch()` on the
// returned value isn't enough; try/await covers both sync throws and rejections.
async function orNull<T>(call: () => Promise<T>): Promise<T | null> {
	try {
		return await call().catch(() => null);
	} catch {
		return null;
	}
}

// Resolve returns frame rates as rounded decimals, e.g. 23.976 for 24000/1001.
function toFrameRate(fps: number, dropFrame: boolean): FrameRate {
	const nominal = Math.round(fps);
	if (Math.abs(fps - nominal) < 0.001) {
		return { fpsNumerator: nominal, fpsDenominator: 1, dropFrame };
	}
	const ntsc = Math.round(fps * 1.001);
	if (Math.abs(fps - (ntsc * 1000) / 1001) < 0.001) {
		return { fpsNumerator: ntsc * 1000, fpsDenominator: 1001, dropFrame };
	}
	return { fpsNumerator: Math.round(fps * 1000), fpsDenominator: 1000, dropFrame };
}

const RENDER_POLL_INTERVAL_MS = 500;

async function waitForRenderJob(
	project: Project,
	jobId: string,
	onProgress: (progress: RenderProgress) => void,
) {
	while (true) {
		const status = await project.GetRenderJobStatus(jobId);
		if (!status?.JobStatus) throw new Error(`Render job ${jobId} not found`);

		switch (status.JobStatus) {
			case "Complete":
				onProgress({ percent: 100, estimatedTimeRemainingMs: 0 });
				return;
			case "Failed":
			case "Cancelled":
			case "Background Render Cancelled":
				throw new Error(
					`Render ${status.JobStatus.toLowerCase()}${status.Error ? `: ${status.Error}` : ""}`,
				);
			case "Rendering":
				onProgress({
					percent: status.CompletionPercentage ?? 0,
					estimatedTimeRemainingMs: status.EstimatedTimeRemainingInMs ?? 0,
				});
		}

		await sleep(RENDER_POLL_INTERVAL_MS);
	}
}

// SetRenderSettings returns false if any single key is rejected, without saying which.
// On failure, apply the keys one by one so the error names the rejected ones.
async function applyRenderSettings(project: Project, settings: Partial<RenderSettings>) {
	if (await project.SetRenderSettings(settings)) return;

	const rejected: string[] = [];
	for (const [key, value] of Object.entries(settings)) {
		if (!(await orNull(() => project.SetRenderSettings({ [key]: value })))) {
			rejected.push(`${key}=${JSON.stringify(value)}`);
		}
	}
	throw new Error(`Resolve rejected render settings: ${rejected.join(", ") || "unknown"}`);
}

// Renders the current timeline as an H.265 MP4 at timeline resolution and frame rate and
// returns the output file path. Resolution, frame rate and range are set explicitly, since
// Resolve keeps whatever the user last selected on the Deliver page for every setting we don't pass.
async function renderPreview(
	targetDirPath: string,
	targetClipName: string,
	onProgress: (progress: RenderProgress) => void,
) {
	const project = await getCurrentProject();
	if (!project) throw new Error("No project open in Resolve");

	const timeline = await project.GetCurrentTimeline();
	if (!timeline) throw new Error("No timeline open in Resolve");

	if (await project.IsRenderingInProgress()) throw new Error("Resolve is already rendering");

	const settings = await timeline.GetSettings();

	const width = Number(settings.timelineResolutionWidth);
	const height = Number(settings.timelineResolutionHeight);
	const frameRate = Number(settings.timelineFrameRate);
	if (!width || !height || !frameRate) throw new Error("Failed to read timeline settings");

	if (!(await project.SetCurrentRenderMode(1)))
		throw new Error("Failed to set single clip render mode");
	if (!(await project.SetCurrentRenderFormatAndCodec("mp4", "H265"))) {
		const codecs = Object.values((await orNull(() => project.GetRenderCodecs("mp4"))) ?? {});
		throw new Error(
			`Resolve can't render MP4/H.265 (available MP4 codecs: ${codecs.join(", ") || "none"})`,
		);
	}

	await applyRenderSettings(project, {
		SelectAllFrames: true,
		TargetDir: targetDirPath,
		CustomName: targetClipName,
		ExportVideo: true,
		ExportAudio: true,
		FormatWidth: width,
		FormatHeight: height,
		FrameRate: frameRate,
	});

	const jobId = await project.AddRenderJob();
	if (!jobId) throw new Error("Failed to add render job");

	try {
		const job = (await project.GetRenderJobList())?.find((j) => j.JobId === jobId);
		if (!job) throw new Error(`Render job ${jobId} not found`);
		const outputPath = path.join(job.TargetDir, job.OutputFilename);

		onProgress({ percent: 0, estimatedTimeRemainingMs: 0 });
		if (!(await project.StartRendering([jobId]))) throw new Error("Failed to start rendering");
		await waitForRenderJob(project, jobId, onProgress);

		return outputPath;
	} finally {
		// Keep the user's render queue clean
		await orNull(() => project.DeleteRenderJob(jobId));
	}
}

async function buildTimelineSnapshot(): Promise<TimelineSnapshot | null> {
	const project = await getCurrentProject();
	if (!project) return null;

	const timeline = await project.GetCurrentTimeline();
	if (!timeline) return null;

	const settings = await timeline.GetSettings();
	const frameRate = toFrameRate(
		Number(settings.timelineFrameRate),
		settings.timelineDropFrameTimecode === "1",
	);
	const fps = (rate: FrameRate) => rate.fpsNumerator / rate.fpsDenominator;

	const mediaItems = new Map<string, MediaItem>();
	const convertMedia = async (media: MediaPoolItem) => {
		const id = await media.GetUniqueId();
		const props = await media.GetClipProperty();
		const mediaFps = Number(props.FPS);
		const mediaItem: MediaItem = {
			id,
			name: await media.GetName(),
			type: props.Type === "Audio" ? "audio" : "video",
			filePath: props["File Path"],
			// Audio-only media has no frame rate of its own
			frameRate: mediaFps > 0 ? toFrameRate(mediaFps, props["Drop frame"] === "1") : frameRate,
			startTimecode: props["Start TC"],
			metadata: await media.GetMetadata(),
		};
		mediaItems.set(id, mediaItem);
		return mediaItem;
	};

	const convertClip = async (item: TimelineItem): Promise<Clip | null> => {
		if (!(await item.GetClipEnabled())) return null;

		const durationFrameCount = Math.round(await item.GetDuration(true));
		const mediaPoolItem = await orNull(async () => await item.GetMediaPoolItem());
		const media = mediaPoolItem && (await convertMedia(mediaPoolItem));

		let sourceStartFrameIndex = null;
		let speed = 1;
		if (media) {
			// Source times are seconds since the media's 00:00:00:00, which makes them absolute.
			// GetSourceStartFrame() is relative to the media start and sometimes off by a frame.
			const sourceStart = await item.GetSourceStartTime();
			const sourceEnd = await item.GetSourceEndTime();
			sourceStartFrameIndex = Math.floor(sourceStart * fps(media.frameRate) + 0.001);
			// The API has no speed or retime curve, so speed is the average over the clip.
			const timelineSeconds = durationFrameCount / fps(frameRate);
			speed = Math.round(((sourceEnd - sourceStart) / timelineSeconds) * 1e4) / 1e4;
		}

		const colorName = await item.GetClipColor();

		return {
			id: await item.GetUniqueId(),
			name: await item.GetName(),
			mediaId: media?.id ?? null,
			startFrameIndex: Math.round(await item.GetStart(true)),
			durationFrameCount,
			sourceStartFrameIndex,
			speed,
			metadata: {},
			color: colorName ? { name: colorName, hex: CLIP_PALETTE[colorName] } : null,
		};
	};

	const tracks = (
		await Promise.all(
			(["video", "audio"] as const).map(async (type) => {
				const trackCount = await timeline.GetTrackCount(type);
				return await Promise.all(
					// Resolve track indices are 1-based
					Array.from({ length: trackCount }, async (_, i): Promise<Track> => {
						const index = i + 1;
						const items = (await timeline.GetIsTrackEnabled(type, index))
							? await timeline.GetItemListInTrack(type, index)
							: [];
						const clips = await Promise.all(items.map(convertClip));
						return {
							id: `${type}${index}`,
							type,
							name: await timeline.GetTrackName(type, index),
							clips: clips.filter((clip) => clip !== null),
						};
					}),
				);
			}),
		)
	).flat();

	// GetEndFrame() is exclusive, it equals the last clip's GetEnd()
	const startFrameIndex = await timeline.GetStartFrame();
	return {
		id: await timeline.GetUniqueId(),
		name: await timeline.GetName(),
		tracks,
		mediaItems: [...mediaItems.values()],
		frameRate,
		startFrameIndex,
		durationFrameCount: (await timeline.GetEndFrame()) - startFrameIndex,
		metadata: {},
	};
}

// Resolve throws instead of returning false for some failures, e.g. when no marker is at the frame
async function updateMarkerCustomData(timeline: Timeline, frame: number, customData: string) {
	try {
		return await timeline.UpdateMarkerCustomData(frame, customData);
	} catch (error) {
		console.warn(`Couldn't store the marker id at frame ${frame}:`, error);
		return false;
	}
}

// The timeline's markers with their real frames (relative to the timeline start).
// Resolve's JS GetMarkers() can report frames off by one from what AddMarker, DeleteMarkerAtFrame and
// UpdateMarkerCustomData use (seen one frame low on a 59.94 fps timeline, the Python API is correct).
// The offset is measured on every call instead of assumed. With probe, a timeline whose markers
// have no custom data yet gets a test value written to one marker to measure it.
async function listMarkers(timeline: Timeline, { probe }: { probe: boolean }) {
	const read = async () =>
		Object.entries((await timeline.GetMarkers()) ?? {}).map(([key, info]) => ({
			key: Number(key),
			info,
		}));
	let entries = await read();
	let offset = await measureKeyOffset(timeline, entries);

	if (offset === null && probe && entries[0]) {
		const token = stringifyPostPinData({ probe: crypto.randomUUID() });
		const written = await writeNear(timeline, entries[0].key, token);
		if (written !== null) {
			entries = await read();
			const found = entries.find((e) => e.info.customData === token);
			if (found) offset = written - found.key;
		}
	}

	return entries.map(({ key, info }) => ({ frame: key + (offset ?? 0), info }));
}

const KEY_OFFSETS = [0, 1, -1];

// How far GetMarkers() keys are from real frames, judged by a marker with custom data
async function measureKeyOffset(timeline: Timeline, entries: { key: number; info: MarkerInfo }[]) {
	// Copies share custom data, so only a unique value identifies its marker
	const count = (data: string) => entries.filter((e) => e.info.customData === data).length;
	const known = entries.find((e) => e.info.customData && count(e.info.customData) === 1);
	if (!known) return null;
	for (const offset of KEY_OFFSETS) {
		if ((await getMarkerCustomData(timeline, known.key + offset)) === known.info.customData) {
			return offset;
		}
	}
	return null;
}

// Writes custom data at the first frame near key that has a marker, returns that frame
async function writeNear(timeline: Timeline, key: number, customData: string) {
	for (const offset of KEY_OFFSETS) {
		if (await updateMarkerCustomData(timeline, key + offset, customData)) return key + offset;
	}
	return null;
}

async function getMarkerCustomData(timeline: Timeline, frame: number) {
	try {
		return await timeline.GetMarkerCustomData(frame);
	} catch {
		return null;
	}
}

// Like UpdateMarkerCustomData, AddMarker can throw instead of returning false
async function addMarker(timeline: Timeline, frame: number, marker: MarkerInfo) {
	try {
		return await timeline.AddMarker(
			frame,
			marker.color,
			marker.name,
			marker.note,
			marker.duration,
			marker.customData || undefined,
		);
	} catch (error) {
		console.warn(`Couldn't add a marker at frame ${frame}:`, error);
		return false;
	}
}

const resolveBridge: NleBridge = {
	getCapabilities: async () => ({
		hostName: "Resolve",
		palette: Object.entries(MARKER_PALETTE).map(([name, hex]) => ({ id: name, name, hex })),
		renderPresets: true,
		renderToDisk: true,
		snapshotClips: true,
		customMarkerData: true,
	}),
	getProjectId: async () => {
		const project = await getCurrentProject();
		if (!project) throw new Error("No project open in Resolve");

		return await project.GetUniqueId();
	},
	getTimelineInfo: async () => {
		const timeline = await getCurrentTimeline();
		if (!timeline) throw new Error("No timeline open in Resolve");
		const project = await getCurrentProject();
		if (!project) throw new Error("No project open in Resolve");
		const frame = await timeline.ExportFrame(0, {});
		return {
			id: await timeline.GetUniqueId(),
			name: await timeline.GetName(),
			projectId: await project.GetUniqueId(),
			projectName: await project.GetName(),
			thumbnailDataUrl: frame ? `data:image/png;base64,${frame.data}` : undefined,
		};
	},
	// Resolve marker frames are relative to the timeline start, bridge frames are absolute.
	// Ids live in the markers' custom data, see markerIds.ts.
	getMarkers: async () => {
		const timeline = await getCurrentTimeline();
		const [timelineId, startFrame] = await Promise.all([
			timeline.GetUniqueId(),
			timeline.GetStartFrame(),
		]);
		const entries = (await listMarkers(timeline, { probe: true })).map(({ frame, info }) => ({
			frame,
			marker: info,
		}));

		const withIds = assignMarkerIds(
			timelineId,
			entries.map(({ frame, marker }) => ({ frame, customData: marker.customData || null })),
		);

		// One at a time: parallel updates make Resolve report "No marker exists at the input FrameId"
		const result = [];
		for (const [i, { frame, marker }] of entries.entries()) {
			let { nleId, customData, changed } = withIds[i]!;
			if (changed && !(await updateMarkerCustomData(timeline, frame, customData ?? ""))) {
				// Without stored custom data the id wouldn't survive, fall back to the frame
				nleId = `${timelineId}:${frame}`;
				customData = marker.customData || null;
			}
			result.push({
				nleId,
				title: marker.name,
				description: marker.note,
				frame: frame + startFrame,
				color: marker.color,
				customData,
			});
		}
		return result;
	},
	// Resolve can't edit a marker's name, color or note, so an update deletes and re-adds it
	setMarkers: async (markers) => {
		const timeline = await getCurrentTimeline();
		const [timelineId, startFrame, current] = await Promise.all([
			timeline.GetUniqueId(),
			timeline.GetStartFrame(),
			listMarkers(timeline, { probe: false }),
		]);
		const byId = readMarkerIds(
			timelineId,
			current.map(({ frame, info }) => ({ frame, customData: info.customData || null, info })),
		);

		// Remove the markers to update first, so markers moving onto each other's frames don't collide
		const replaced = new Map<NleMarker, NonNullable<ReturnType<typeof byId.get>>>();
		for (const marker of markers) {
			const existing = marker.nleId ? byId.get(marker.nleId) : undefined;
			if (!existing || [...replaced.values()].includes(existing)) continue;
			if (await timeline.DeleteMarkerAtFrame(existing.frame)) replaced.set(marker, existing);
		}

		const ids: string[] = [];
		const failedFrames: number[] = [];
		for (const [i, marker] of markers.entries()) {
			const frame = marker.frame - startFrame;
			const existing = replaced.get(marker);
			const { nleId, customData } = existing
				? replacedMarkerData(
						timelineId,
						marker.nleId!,
						frame,
						existing.customData,
						marker.customData,
					)
				: newMarkerData(timelineId, frame, marker.customData);
			const added = await addMarker(timeline, frame, {
				color: marker.color as MarkerColor,
				name: marker.title || `M${i + 1}`,
				note: marker.description,
				duration: existing?.info.duration ?? 1,
				customData: customData ?? "",
			});
			if (added) {
				ids.push(nleId);
				continue;
			}
			// Usually another marker is at that frame. Put back the marker this one should have replaced.
			failedFrames.push(marker.frame);
			if (existing) await addMarker(timeline, existing.frame, existing.info);
			ids.push(existing ? marker.nleId! : "");
		}

		if (failedFrames.length > 0) {
			throw new Error(
				`Couldn't place ${failedFrames.length} marker(s) at frame ${failedFrames.join(", ")}, ` +
					"there is probably another marker at the same frame in Resolve",
			);
		}
		return ids;
	},
	clearMarkers: async () => {
		await (await getCurrentTimeline()).DeleteMarkersByColor("All");
	},
	getRenderPresets: async () => {
		const project = await getCurrentProject();
		if (!project) return [];

		return await project.GetRenderPresetList();
	},
	renderPreview: (onProgress) =>
		renderPreview(os.tmpdir(), `postpin-preview-${Date.now()}`, onProgress),
	buildTimelineSnapshot,
};

const ICON_PATH = path.join(__dirname, "icon.png");

function openWindow() {
	const win = createWindow({
		title: "PostPin for DaVinci Resolve",
		iconPath: ICON_PATH,
		preloadPath: path.join(__dirname, "preload.js"),
		devServerUrl: DEV_SERVER_URL,
		url: path.join(__dirname, "ui/index.html"),
	});

	exposeHostBridge(win, { clientId: CLIENT_ID, defaultServerUrl: DEFAULT_SERVER_URL });
	exposeNleBridge(win, resolveBridge);

	win.on("close", () => {
		cleanup();
		app.quit();
	});
}

app.whenReady().then(() => {
	// Resolve runs the plugin in its own Electron process, which shows up in the dock with
	// Electron's icon. Only this process is affected, Resolve keeps its own icon.
	if (process.platform === "darwin") app.dock?.setIcon(ICON_PATH);
	openWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		cleanup();
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) openWindow();
});
