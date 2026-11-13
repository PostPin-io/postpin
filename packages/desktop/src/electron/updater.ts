import { app, net, type BrowserWindow } from "electron";
import { autoUpdater, type ProgressInfo } from "electron-updater";
import { releaseApiVersionUrl } from "@postpin-io/shared/api-version";
import { UpdaterAPI } from "../ipc/browser/PostPinDesktop";

/** API version a release speaks, from its api-version.json asset; null when it can't be read */
async function releaseApiVersion(version: string) {
	try {
		const res = await net.fetch(releaseApiVersionUrl(version));
		if (!res.ok) return null;
		const { apiVersion } = (await res.json()) as { apiVersion?: unknown };
		return typeof apiVersion === "number" && Number.isInteger(apiVersion) ? apiVersion : null;
	} catch {
		return null;
	}
}

/** Lets the UI update the app, e.g. when the server speaks a newer API version */
export function exposeUpdater(win: BrowserWindow) {
	const dispatcher = UpdaterAPI.for(win.webContents).setImplementation({
		checkForUpdate: async () => {
			// development builds have no update feed
			if (!app.isPackaged) return null;
			// the UI decides what to download (only releases that fit the server's API version)
			autoUpdater.autoDownload = false;
			// a downloaded update installs when the app quits, unless installUpdate() restarts sooner
			autoUpdater.autoInstallOnAppQuit = true;
			const result = await autoUpdater.checkForUpdates();
			if (!result?.isUpdateAvailable) return null;
			const { version } = result.updateInfo;
			const apiVersion = await releaseApiVersion(version);
			return apiVersion === null ? { version } : { version, apiVersion };
		},
		downloadUpdate: async () => {
			const onProgress = ({ percent }: ProgressInfo) =>
				dispatcher.dispatchUpdateProgress(percent / 100);
			autoUpdater.on("download-progress", onProgress);
			try {
				await autoUpdater.downloadUpdate();
			} finally {
				autoUpdater.off("download-progress", onProgress);
			}
			return true;
		},
		installUpdate: () => {
			// after this call has answered: quitAndInstall closes the window
			setImmediate(() => autoUpdater.quitAndInstall());
			return true;
		},
	});
}
