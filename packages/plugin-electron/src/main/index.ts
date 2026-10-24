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

export interface WindowOptions {
	// bundled preload script, which imports @postpin-io/plugin-electron/preload
	preloadPath: string;
	// renderer dev server, or empty to load indexHtml
	devServerUrl: string;
	// usually path to index.html or dev server
	url: string;
	width?: number;
	height?: number;
}

export function createWindow({
	preloadPath: preload,
	devServerUrl,
	url: indexHtml,
	width = 900,
	height = 825,
}: WindowOptions) {
	const win = new BrowserWindow({
		width,
		height,
		useContentSize: true,
		webPreferences: { preload },
	});

	if (devServerUrl) {
		win.loadURL(devServerUrl);
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(indexHtml);
	}

	return win;
}

export function exposeHostBridge(win: BrowserWindow, options: AuthOptions) {
	const auth = createAuth(options);
	const settings = createSettings();

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
			await shell.openExternal(`${auth.getServerUrl()}${path.startsWith("/") ? "" : "/"}${path}`);
			return true;
		},
		pickDirectory: async () => {
			const { canceled, filePaths } = await dialog.showOpenDialog(win, {
				title: "Select Directory",
				properties: ["openDirectory"],
			});
			return canceled ? "" : (filePaths[0] ?? "");
		},
	});
}

// allows renderer access to the nle bridge, which the host plugin implements
export function exposeNleBridge(win: BrowserWindow, bridge: NleBridge) {
	const dispatcher = NleAPI.for(win.webContents).setImplementation({
		getCapabilities: async () => toWireCapabilities(await bridge.getCapabilities()),
		getProjectId: () => bridge.getProjectId(),
		getTimelineId: () => bridge.getTimelineId(),
		getMarkers: async () => (await bridge.getMarkers()).map(toWireMarker),
		setMarkers: async (markers) => {
			await bridge.setMarkers(markers.map(fromWireMarker));
			return true;
		},
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
