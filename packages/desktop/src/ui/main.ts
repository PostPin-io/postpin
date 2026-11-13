import { mount } from "svelte";
import type { Updater } from "@postpin-io/plugin-core/bridge";
import { connectHostBridge, connectNleBridge } from "@postpin-io/plugin-electron/renderer";
import { UpdaterAPI, type IUpdaterAPIRenderer } from "../ipc/renderer/PostPinDesktop";
import DesktopApp from "./DesktopApp.svelte";
import "./app.css";

// Electron wraps errors from the main process: "Error invoking remote method 'x': Error: msg"
const cleanError = (err: unknown) =>
	err instanceof Error
		? new Error(err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, ""))
		: err;

function connectUpdater(): Updater {
	if (!UpdaterAPI) throw new Error("UpdaterAPI is not exposed, is the desktop preload loaded?");
	const api = UpdaterAPI as IUpdaterAPIRenderer;
	return {
		check: async () => {
			const update = await api.checkForUpdate().catch((err) => {
				throw cleanError(err);
			});
			return update && { version: update.version, apiVersion: update.apiVersion ?? null };
		},
		download: async (onProgress) => {
			// the preload clones the listener's result back, so return nothing
			const unsubscribe = api.onUpdateProgress((fraction) => {
				onProgress(fraction);
			});
			try {
				await api.downloadUpdate();
			} catch (err) {
				throw cleanError(err);
			} finally {
				unsubscribe();
			}
		},
		install: async () => {
			await api.installUpdate();
		},
	};
}

const app = mount(DesktopApp, {
	target: document.getElementById("app")!,
	props: {
		nle: connectNleBridge(),
		host: { ...(await connectHostBridge()), updater: connectUpdater() },
	},
});

export default app;
