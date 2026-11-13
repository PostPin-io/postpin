// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security
// Runs inside Resolve's Electron 36 as well, so don't use APIs newer than that.

import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import { BrowserWindow, dialog, shell } from "electron";
import { stat } from "node:fs/promises";
import { CommonAPI, NleAPI } from "../ipc/browser/PostPin";
import { fromWireMarker, toWireCapabilities, toWireMarker } from "../wire";
import { createAuth, type AuthOptions } from "./auth";
import { createSettings } from "./settings";
import { uploadFile } from "./upload";
import { killAll, probe, removeFile, transcode } from "./transcode";
import { findFfmpeg, type FfmpegPaths } from "./ffmpeg";

export interface WindowOptions {
	// bundled preload script, which imports @postpin-io/plugin-electron/preload
	preloadPath: string;
	// renderer dev server, or empty to load indexHtml
	devServerUrl: string;
	// usually path to index.html or dev server
	url: string;
	// shown in the window switcher and Window menu, the title bar itself is hidden
	title?: string;
	// window icon on Windows and Linux, macOS uses the app bundle's icon
	iconPath?: string;
	width?: number;
	height?: number;
}

export interface HostBridgeOptions extends AuthOptions {
	ffmpegDir?: string;
}

export function createWindow({
	preloadPath: preload,
	devServerUrl,
	url: indexHtml,
	title = "PostPin",
	iconPath,
	width = 900,
	height = 825,
}: WindowOptions) {
	const win = new BrowserWindow({
		title,
		icon: iconPath,
		width,
		height,
		useContentSize: true,
		webPreferences: { preload },
		minWidth: 400,
		minHeight: 400,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 10, y: 18 },
		...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
	});

	// Keep our title instead of the page's <title>
	win.on("page-title-updated", (event) => event.preventDefault());

	if (devServerUrl) {
		win.loadURL(devServerUrl);
		// Opt-in, because app-region drag doesn't work reliably while DevTools is open.
		// Otherwise open it with View › Toggle Developer Tools (⌥⌘I).
		if (process.env.POSTPIN_DEVTOOLS) win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(indexHtml);
	}

	return win;
}

export function exposeHostBridge(win: BrowserWindow, options: HostBridgeOptions) {
	const auth = createAuth(options);
	const settings = createSettings();

	let ffmpeg: FfmpegPaths | null = null;
	try {
		if (options.ffmpegDir) {
			ffmpeg = findFfmpeg(options.ffmpegDir);
		}
	} catch (error) {
		console.warn("[postpin] no ffmpeg, the server encodes:", error);
	}
	const needFfmpeg = () => ffmpeg ?? Promise.reject(new Error("This host has no ffmpeg"));
	win.on("closed", killAll);

	const dispatcher = CommonAPI.for(win.webContents).setImplementation({
		getServerUrl: async () => auth.getServerUrl(),
		getDefaultServerUrl: async () => auth.getDefaultServerUrl(),
		getSession: () => auth.getSession(),
		login: async ({ serverBaseUrl }) => {
			auth.setServerUrl(serverBaseUrl);
			await auth.login((userCode, verificationUri) => {
				dispatcher.dispatchLoginCode({ userCode, verificationUri });
			});
			dispatcher.dispatchSessionChanged(await auth.getSession());
			return true;
		},
		logout: async () => {
			await auth.logout();
			dispatcher.dispatchSessionChanged(await auth.getSession());
			return true;
		},
		getSettings: async () => settings.get(),
		saveSettings: async (value) => {
			settings.save(value);
			return true;
		},
		getFileSize: async (path) => (await stat(path)).size,
		uploadFile: (path, partSize, parts) =>
			uploadFile(path, partSize, parts, (progress) => dispatcher.dispatchUploadProgress(progress)),
		openInBrowser: async (path) => {
			// absolute https URLs open as they are, e.g. a release download
			await shell.openExternal(
				/^https:\/\//.test(path)
					? path
					: `${auth.getServerUrl()}${path.startsWith("/") ? "" : "/"}${path}`,
			);
			return true;
		},
		pickDirectory: async () => {
			const { canceled, filePaths } = await dialog.showOpenDialog(win, {
				title: "Select Directory",
				properties: ["openDirectory"],
			});
			return canceled ? "" : (filePaths[0] ?? "");
		},
		setProgress: async (fraction) => {
			win.setProgressBar(fraction);
			return true;
		},
		getToken: async () => auth.getToken(),
		canTranscode: async () => ffmpeg !== null,
		probe: async (file) => {
			const media = await probe(await needFfmpeg(), file);
			// eipc: optional fields are left out, not null
			return {
				width: media.width,
				height: media.height,
				hasAudio: media.hasAudio,
				...(media.rotation !== null && { rotation: media.rotation }),
				...(media.duration !== null && { duration: media.duration }),
			};
		},
		transcode: async (input, renditions, hasAudio) =>
			transcode(await needFfmpeg(), input, renditions, hasAudio, (f) =>
				dispatcher.dispatchTranscodeProgress(f),
			),
		removeFile: async (file) => {
			await removeFile(file);
			return true;
		},
	});
}

// allows renderer access to the nle bridge, which the host plugin implements
export function exposeNleBridge(win: BrowserWindow, bridge: NleBridge) {
	const dispatcher = NleAPI.for(win.webContents).setImplementation({
		getCapabilities: async () => toWireCapabilities(await bridge.getCapabilities()),
		getProjectId: () => bridge.getProjectId(),
		getTimelineInfo: () => bridge.getTimelineInfo(),
		getMarkers: async () => (await bridge.getMarkers()).map(toWireMarker),
		setMarkers: (markers) => bridge.setMarkers(markers.map(fromWireMarker)),
		clearMarkers: async () => {
			await bridge.clearMarkers();
			return true;
		},
		getRenderPresets: () => bridge.getRenderPresets(),
		renderPreview: () =>
			bridge.renderPreview((progress) => dispatcher.dispatchRenderProgress(progress)),
		buildTimelineSnapshot: () => bridge.buildTimelineSnapshot(),
	});
}
