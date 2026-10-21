// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security

import { app, BrowserWindow, shell, dialog, safeStorage } from "electron";
import path from "path";
// @ts-ignore
import WorkflowIntegrationModule from "./WorkflowIntegration.node";
import type {
	MediaPoolItem,
	Project,
	ProjectManager,
	RenderSettings,
	Resolve,
	TimelineItem,
	WorkflowIntegrationModule as WI,
} from "./resolve";
import {
	MainAPI,
	MarkerColor,
	type RenderProgress,
	type Settings,
	type UploadedPart,
	type UploadPartUrl,
	type UploadProgress,
} from "../ipc/browser/PostPinResolveAPI";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import http, { type IncomingMessage } from "http";
import https from "https";
import { pipeline } from "stream/promises";
import { setTimeout as sleep } from "timers/promises";
import type {
	Clip,
	FrameRate,
	MediaItem,
	TimelineSnapshot,
	Track,
} from "@postpin-io/shared/types/TimelineSnapshot";

import Store from "electron-store";
import { getSession, login, logout } from "./auth";

const store = new Store<{ lastSettings?: Partial<Settings> }>();

declare const DEV_SERVER_URL: string;

const PLUGIN_ID = "io.postpin.plugin.resolve";

const WorkflowIntegration: WI = WorkflowIntegrationModule;

// Cached objects
let resolveObj: Resolve | null = null;
let projectManagerObj: ProjectManager | null = null;

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

	resolveObj = null;
	projectManagerObj = null;
}

// Gets Resolve object.
async function getResolve() {
	if (!resolveObj) {
		resolveObj = await initResolveInterface();
	}

	return resolveObj;
}

// Gets project manager object.
async function getProjectManager() {
	if (!projectManagerObj) {
		const resolve = await getResolve();
		if (resolve) {
			projectManagerObj = (await resolve.GetProjectManager()) ?? null;
			if (!projectManagerObj) {
				console.log("Error: Failed to get ProjectManager object!");
			}
		}
	}

	return projectManagerObj;
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

const UPLOAD_CONCURRENCY = 4;
const UPLOAD_PART_ATTEMPTS = 3;
const UPLOAD_PROGRESS_INTERVAL_MS = 200;

// PUTs the byte range [start, end] of the file and returns the ETag S3 assigned to the part.
async function uploadPart(
	sourcePath: string,
	uploadUrl: string,
	start: number,
	end: number,
	onBytes: (byteCount: number) => void,
) {
	const url = new URL(uploadUrl);

	// @ts-ignore
	const request = (url.protocol === "https:" ? https : http).request(url, {
		method: "PUT",
		headers: { "Content-Length": end - start + 1 },
	});
	const response = new Promise<IncomingMessage>((resolve, reject) => {
		request.once("response", resolve);
		request.once("error", reject);
	});

	const source = createReadStream(sourcePath, { start, end });
	source.on("data", (chunk) => onBytes(chunk.length));
	const [, res] = await Promise.all([pipeline(source, request), response]);

	let body = "";
	for await (const chunk of res) body += chunk;
	if (!res.statusCode || res.statusCode >= 300) {
		throw new Error(`status ${res.statusCode}: ${body}`);
	}

	const etag = res.headers.etag;
	if (!etag) throw new Error("no ETag in response");
	return etag;
}

// Uploads the file as S3 multipart upload, part n being bytes [(n - 1) * partSize, n * partSize).
async function uploadRenderedFile(
	sourcePath: string,
	partSize: number,
	parts: UploadPartUrl[],
	onProgress: (progress: UploadProgress) => void,
): Promise<UploadedPart[]> {
	const { size } = await stat(sourcePath);
	const expectedPartCount = Math.max(1, Math.ceil(size / partSize));
	if (parts.length !== expectedPartCount) {
		throw new Error(`Expected ${expectedPartCount} upload URLs, got ${parts.length}`);
	}

	let uploadedBytes = 0;
	let lastProgressAt = 0;
	const reportProgress = (force = false) => {
		const now = Date.now();
		if (!force && now - lastProgressAt < UPLOAD_PROGRESS_INTERVAL_MS) return;
		lastProgressAt = now;
		onProgress({ uploadedBytes, totalBytes: size });
	};
	reportProgress(true);

	const queue = [...parts];
	const uploaded: UploadedPart[] = [];
	const worker = async () => {
		for (let part = queue.shift(); part; part = queue.shift()) {
			const start = (part.partNumber - 1) * partSize;
			const end = Math.min(start + partSize, size) - 1;
			for (let attempt = 1; ; attempt++) {
				let partBytes = 0;
				try {
					const etag = await uploadPart(sourcePath, part.url, start, end, (byteCount) => {
						partBytes += byteCount;
						uploadedBytes += byteCount;
						reportProgress();
					});
					uploaded.push({ partNumber: part.partNumber, etag });
					break;
				} catch (err) {
					// The part starts over, so its bytes no longer count
					uploadedBytes -= partBytes;
					if (attempt >= UPLOAD_PART_ATTEMPTS) {
						// Stop the other workers from picking up more parts
						queue.length = 0;
						const message = err instanceof Error ? err.message : String(err);
						throw new Error(`Upload of part ${part.partNumber} failed: ${message}`);
					}
					await sleep(1000 * attempt);
				}
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, parts.length) }, worker));

	reportProgress(true);
	return uploaded;
}

// Gets render presets string list.
async function getRenderPresets(): Promise<string[]> {
	const project = await getCurrentProject();
	if (!project) return [];

	return await project.GetRenderPresetList();
}

function setupIPC(win: BrowserWindow) {
	const dispatcher = MainAPI.for(win.webContents).setImplementation({
		renderPreview: (targetDirPath, targetClipName) =>
			renderPreview(targetDirPath, targetClipName, (progress) =>
				dispatcher.dispatchRenderProgress(progress),
			),
		getRenderPresets,
		getFileSize: async (path) => (await stat(path)).size,
		uploadRenderedFile: (sourcePath, partSize, parts) =>
			uploadRenderedFile(sourcePath, partSize, parts, (progress) =>
				dispatcher.dispatchUploadProgress(progress),
			),
		openInBrowser: async (path: string) => {
			shell.openExternal(`http://localhost:5173${path.startsWith("/") ? "" : "/"}${path}`);
			return true;
		},
		buildTimelineSnapshot: async () => {
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
			const result: TimelineSnapshot = {
				id: await timeline.GetUniqueId(),
				name: await timeline.GetName(),
				tracks,
				mediaItems: [...mediaItems.values()],
				frameRate,
				startFrameIndex,
				durationFrameCount: (await timeline.GetEndFrame()) - startFrameIndex,
				metadata: {},
			};
			return result;
		},
		getLastSettings: async () => {
			const settings = store.get("lastSettings") ?? {};
			return {
				filename: settings.filename ?? "",
				outputPath: settings.outputPath ?? "",
				renderToDisk: settings.renderToDisk ?? false,
			};
		},
		saveSettings: async (settings) => {
			store.set("lastSettings", settings);
			return true;
		},
		pickOutputDirectory: async () => {
			const { canceled, filePaths } = await dialog.showOpenDialog(win, {
				title: "Select Output Directory",
				properties: ["openDirectory"],
			});
			if (canceled || filePaths.length === 0) return "";
			return filePaths[0];
		},
		getMarkers: async () => {
			const project = await getCurrentProject();
			if (!project) return [];

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return [];

			const markers = await timeline.GetMarkers();
			if (!markers) return [];

			return Object.entries(markers).map(([frameStr, marker]) => ({
				title: marker.name,
				description: marker.note,
				frame: Number(frameStr),
				color: marker.color as MarkerColor,
				customData: marker.customData,
			}));
		},
		setMarkers: async (markers) => {
			const project = await getCurrentProject();
			if (!project) return false;

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return false;

			for (const marker of markers) {
				await timeline.AddMarker(
					marker.frame,
					marker.color,
					marker.title,
					marker.description,
					1,
					marker.customData,
				);
			}

			return true;
		},
		setMarker: async (marker) => {
			const project = await getCurrentProject();
			if (!project) return false;

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return false;

			await timeline.AddMarker(
				marker.frame,
				marker.color,
				marker.title,
				marker.description,
				1,
				marker.customData,
			);

			return true;
		},
		clearMarkers: async () => {
			const project = await getCurrentProject();
			if (!project) return false;

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return false;

			return await timeline.DeleteMarkersByColor("All");
		},
		deleteMarker: async (frame) => {
			const project = await getCurrentProject();
			if (!project) return false;

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return false;

			return await timeline.DeleteMarkerAtFrame(frame);
		},
		getTimelineStartFrame: async () => {
			const project = await getCurrentProject();
			if (!project) return 0;

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) return 0;

			return await timeline.GetStartFrame();
		},
		test: async () => {
			return safeStorage.isAsyncEncryptionAvailable();
		},
		getProjectId: async () => {
			const project = await getCurrentProject();
			if (!project) throw new Error("No project open in Resolve");

			return await project.GetUniqueId();
		},
		getTimelineId: async () => {
			const project = await getCurrentProject();
			if (!project) throw new Error("No project open in Resolve");

			const timeline = await project.GetCurrentTimeline();
			if (!timeline) throw new Error("No timeline open in Resolve");

			return await timeline.GetUniqueId();
		},
		login: async () => {
			await login((userCode, verificationUri) => {
				dispatcher.dispatchLoginCode({ userCode, verificationUri });
			});
			dispatcher.dispatchSessionChanged(await getSession());
			return true;
		},
		getSession: async () => {
			const session = await getSession();
			return session;
		},
		getSessionToken: async () => {
			const session = await getSession();
			return session?.session.token ?? "";
		},
		logout: async () => {
			await logout();
			dispatcher.dispatchSessionChanged(await getSession());
			return true;
		},
	});
}

let currentlyRunningLogin: Promise<void> | null = null;

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 900,
		height: 825,
		useContentSize: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	setupIPC(mainWindow);

	mainWindow.on("close", () => {
		cleanup();
		app.quit();
	});

	if (DEV_SERVER_URL) {
		mainWindow.loadURL(DEV_SERVER_URL);
		mainWindow.webContents.openDevTools({ mode: "detach" });
	} else {
		mainWindow.loadFile(path.join(__dirname, "ui/index.html"));
	}
}

app.whenReady().then(() => {
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		cleanup();
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
