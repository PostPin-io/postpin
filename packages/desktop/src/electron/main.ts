// NOTE: Follow the security guide while implementing the app https://www.electronjs.org/docs/tutorial/security

import { createWindow, exposeHostBridge, exposeNleBridge } from "@postpin-io/plugin-electron/main";
import { autoUpdater } from "electron-updater";
import { app, BrowserWindow } from "electron";
import path from "path";
import { ADAPTERS, createSwitchBridge, getSelectedHost } from "../adapters";
import { DesktopAPI } from "../ipc/browser/PostPinDesktop";
import { restoreSelectedHost, selectAndSaveHost } from "./hostSelection";

declare const DEV_SERVER_URL: string;
declare const DEFAULT_SERVER_URL: string;

const CLIENT_ID = "io.postpin.desktop";

const ICON_PATH = path.join(__dirname, "icon.png");

// Created once: on macOS the window can be closed and reopened while the app keeps running
const nle = createSwitchBridge();

function openWindow() {
	const win = createWindow({
		title: "PostPin Desktop",
		iconPath: ICON_PATH,
		preloadPath: path.join(__dirname, "preload.cjs"),
		devServerUrl: DEV_SERVER_URL,
		url: path.join(__dirname, "ui/index.html"),
	});

	exposeHostBridge(win, { clientId: CLIENT_ID, defaultServerUrl: DEFAULT_SERVER_URL });
	exposeNleBridge(win, nle);
	DesktopAPI.for(win.webContents).setImplementation({
		listHosts: () => ADAPTERS.map(({ id, name }) => ({ id, name })),
		getSelectedHost: () => getSelectedHost() ?? "",
		selectHost: (id) => {
			selectAndSaveHost(id);
			return true;
		},
	});
}

app.whenReady().then(() => {
	if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(ICON_PATH);
	restoreSelectedHost();
	openWindow();
	if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) openWindow();
});
