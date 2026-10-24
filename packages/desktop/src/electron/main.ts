// NOTE: Follow the security guide while implementing the app https://www.electronjs.org/docs/tutorial/security

import { createWindow, exposeHostBridge, exposeNleBridge } from "@postpin-io/plugin-electron/main";
import { app, BrowserWindow } from "electron";
import path from "path";
import { createProToolsAdapter } from "../adapters/pro-tools";

declare const DEV_SERVER_URL: string;
declare const DEFAULT_SERVER_URL: string;

const CLIENT_ID = "io.postpin.desktop";

function openWindow() {
	const win = createWindow({
		preloadPath: path.join(__dirname, "preload.cjs"),
		devServerUrl: DEV_SERVER_URL,
		url: path.join(__dirname, "ui/index.html"),
	});

	exposeHostBridge(win, { clientId: CLIENT_ID, defaultServerUrl: DEFAULT_SERVER_URL });
	exposeNleBridge(win, createProToolsAdapter());
}

app.whenReady().then(() => {
	openWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) openWindow();
});
