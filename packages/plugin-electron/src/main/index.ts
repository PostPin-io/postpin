// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security
// Runs inside Resolve's Electron 36 as well, so don't use APIs newer than that.

import type { NleBridge } from "@postpin-io/plugin-core/bridge";
import { BrowserWindow, dialog, nativeTheme, shell } from "electron";
import { stat } from "node:fs/promises";
import { CommonAPI, NleAPI } from "../ipc/browser/PostPin";
import { fromWireMarker, toWireCapabilities, toWireMarker } from "../wire";
import { createAuth, type AuthOptions } from "./auth";
import { createSettings } from "./settings";
import { uploadFile } from "./upload";
import { killAll, probe, removeFile, transcode } from "./transcode";
import { findFfmpeg, type FfmpegPaths } from "./ffmpeg";

// stdout/stderr are pipes to whoever started the app, e.g. Resolve or the dev terminal. Once that
// end is closed, the next console.log or Node warning fails with EPIPE, which arrives as an
// "error" event and, unhandled, as Electron's "JavaScript error in the main process" dialog.
// Losing the log line is fine; other stream errors still surface.
for (const stream of [process.stdout, process.stderr]) {
	stream.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code !== "EPIPE") throw error;
	});
}

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
	// the page's daisyUI theme, so the window buttons on Windows and Linux match it:
	// "system" for prefers-color-scheme, or the theme a page pins with data-theme (Resolve: "dark")
	theme?: "system" | "light" | "dark";
}

export interface HostBridgeOptions extends AuthOptions {
	ffmpegDir?: string;
}

// Height of the window buttons on Windows and Linux. Matches the plugin-core header (h-12) and
// the drag strip, which pads its end by env(titlebar-area-*) so nothing slides under the buttons.
const TITLE_BAR_HEIGHT = 48;

// The overlay doesn't follow the page: without colors it's a system-colored (mostly white) box.
// These are daisyUI's base-100 and base-content of the light and dark themes. "system" follows
// prefers-color-scheme just like nativeTheme does.
function titleBarOverlay(theme: WindowOptions["theme"]): Electron.TitleBarOverlay {
	const dark = theme === "system" ? nativeTheme.shouldUseDarkColors : theme === "dark";
	return dark
		? { color: "#1d232a", symbolColor: "#ecf9ff", height: TITLE_BAR_HEIGHT }
		: { color: "#ffffff", symbolColor: "#18181b", height: TITLE_BAR_HEIGHT };
}

export function createWindow({
	preloadPath: preload,
	devServerUrl,
	url: indexHtml,
	title = "PostPin",
	iconPath,
	width = 900,
	height = 825,
	theme = "system",
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
		...(process.platform !== "darwin" ? { titleBarOverlay: titleBarOverlay(theme) } : {}),
	});

	if (process.platform !== "darwin" && theme === "system") {
		const updateOverlay = () => win.setTitleBarOverlay(titleBarOverlay(theme));
		nativeTheme.on("updated", updateOverlay);
		win.on("closed", () => nativeTheme.off("updated", updateOverlay));
	}

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
