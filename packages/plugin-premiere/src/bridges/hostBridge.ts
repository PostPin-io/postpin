import type { HostBridge } from "@postpin-io/plugin-core/bridge";
import { uxp } from "../host";
import * as auth from "./auth";
import { settingsStore } from "./settings";
import { getFileSize, uploadFile } from "./upload";

export function createHostBridge(): HostBridge {
	const listeners = new Set<(session: unknown) => void>();
	const notify = async () => {
		const session = await auth.getSession();
		listeners.forEach((listener) => listener(session));
	};

	return {
		getServerUrl: auth.getServerUrl,
		getDefaultServerUrl: async () => auth.getDefaultServerUrl(),
		getSession: auth.getSession,
		login: async (serverUrl, onCode) => {
			await auth.login(serverUrl, onCode);
			await notify();
		},
		logout: async () => {
			await auth.logout();
			await notify();
		},
		onSessionChanged: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSettings: async () => (await settingsStore.read()).settings,
		saveSettings: async (settings) => {
			await settingsStore.update({ settings });
		},
		getFileSize,
		uploadFile,
		openInBrowser: async (path) => {
			const serverUrl = await auth.getServerUrl();
			await uxp.shell.openExternal(`${serverUrl}${path.startsWith("/") ? "" : "/"}${path}`);
		},
		pickDirectory: async () => (await uxp.storage.localFileSystem.getFolder())?.nativePath ?? "",
		// UXP has no dock or taskbar progress
		setProgress: async () => {},
		getToken: auth.getToken,
	};
}
