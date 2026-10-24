// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security

import { app, BrowserWindow } from "electron";
import path from "path";
import os from "os";
// @ts-ignore
import WorkflowIntegrationModule from "./WorkflowIntegration.node";
import type {
	MarkerColor,
	MediaPoolItem,
	Project,
	ProjectManager,
	RenderSettings,
	Resolve,
	TimelineItem,
	WorkflowIntegrationModule as WI,
} from "./resolve";
import { setTimeout as sleep } from "timers/promises";
import type {
	Clip,
	FrameRate,
	MediaItem,
	TimelineSnapshot,
	Track,
} from "@postpin-io/shared/types/TimelineSnapshot";
import type { NleBridge, PaletteColor, RenderProgress } from "@postpin-io/plugin-core/bridge";
import { createWindow, exposeHostBridge, exposeNleBridge } from "@postpin-io/plugin-electron/main";

declare const DEV_SERVER_URL: string;
declare const DEFAULT_SERVER_URL: string;

const PLUGIN_ID = "io.postpin.plugin.resolve";
const CLIENT_ID = "io.postpin.plugin-resolve";

const WorkflowIntegration: WI = WorkflowIntegrationModule;

// Resolve's fixed marker colors; the id is the color name the Resolve API takes
const RESOLVE_PALETTE: PaletteColor[] = [
	{ id: "Blue", hex: "#3B82F6" },
	{ id: "Cyan", hex: "#00FFFF" },
	{ id: "Green", hex: "#00FF00" },
	{ id: "Yellow", hex: "#FFFF00" },
	{ id: "Red", hex: "#FF0000" },
	{ id: "Pink", hex: "#FFC0CB" },
	{ id: "Purple", hex: "#800080" },
	{ id: "Fuchsia", hex: "#FF00FF" },
	{ id: "Rose", hex: "#FF007F" },
	{ id: "Lavender", hex: "#E6E6FA" },
	{ id: "Sky", hex: "#87CEEB" },
	{ id: "Mint", hex: "#98FF98" },
	{ id: "Lemon", hex: "#FFF700" },
	{ id: "Sand", hex: "#C2B280" },
	{ id: "Cocoa", hex: "#A0522D" },
	{ id: "Cream", hex: "#FFFDD0" },
];

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

		return {
			id: await item.GetUniqueId(),
			name: await item.GetName(),
			mediaId: media?.id ?? null,
			startFrameIndex: Math.round(await item.GetStart(true)),
			durationFrameCount,
			sourceStartFrameIndex,
			speed,
			metadata: {},
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

const resolveBridge: NleBridge = {
	getCapabilities: async () => ({
		hostName: "Resolve",
		palette: RESOLVE_PALETTE,
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
	getTimelineId: async () => await (await getCurrentTimeline()).GetUniqueId(),
	// Resolve marker frames are relative to the timeline start, bridge frames are absolute
	getMarkers: async () => {
		const timeline = await getCurrentTimeline();
		const startFrame = await timeline.GetStartFrame();
		const markers = (await timeline.GetMarkers()) ?? {};

		return Object.entries(markers).map(([frameStr, marker]) => ({
			title: marker.name,
			description: marker.note,
			frame: Number(frameStr) + startFrame,
			color: marker.color,
			customData: marker.customData ?? null,
		}));
	},
	setMarkers: async (markers) => {
		const timeline = await getCurrentTimeline();
		const startFrame = await timeline.GetStartFrame();

		for (const marker of markers) {
			await timeline.AddMarker(
				marker.frame - startFrame,
				marker.color as MarkerColor,
				marker.title,
				marker.description,
				1,
				marker.customData ?? undefined,
			);
		}
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

function openWindow() {
	const win = createWindow({
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
