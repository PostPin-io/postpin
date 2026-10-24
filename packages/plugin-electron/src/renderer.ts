import type { HostBridge, NleBridge } from "@postpin-io/plugin-core/bridge";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { CommonAPI, NleAPI } from "./ipc/renderer/PostPin";
import { fromWireCapabilities, fromWireMarker, toWireMarker } from "./wire";

// The preload exposes every method, Partial only reflects that eipc can't prove it
function exposed<T>(api: Partial<T> | undefined, name: string) {
	if (!api) throw new Error(`${name} is not exposed, is the PostPin preload loaded?`);
	return api as T;
}

// Electron wraps errors thrown in the main process: "Error invoking remote method 'x': Error: msg".
// Rethrow them with the original message, so callers don't need to know about Electron.
function withCleanErrors<T extends object>(bridge: T): T {
	const clean = (err: unknown) =>
		err instanceof Error
			? new Error(err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, ""))
			: err;
	return Object.fromEntries(
		Object.entries(bridge).map(([name, method]) => [
			name,
			(...args: unknown[]) => {
				const result = method(...args);
				return result instanceof Promise
					? result.catch((err) => {
							throw clean(err);
						})
					: result;
			},
		]),
	) as T;
}

// The preload calls event listeners across the context bridge, which clones their return value back.
// Listeners like `(p) => (state = p)` return a Svelte state proxy that can't be cloned, so drop the result.
function ignoreResult<E>(listener: (event: E) => unknown) {
	return (event: E) => {
		listener(event);
	};
}

// Runs a call while listening to the progress events it dispatches
async function withEvents<T, E>(
	subscribe: (listener: (event: E) => void) => () => void,
	listener: (event: E) => void,
	call: () => Promise<T>,
) {
	const unsubscribe = subscribe(ignoreResult(listener));
	try {
		return await call();
	} finally {
		unsubscribe();
	}
}

export function connectHostBridge(): HostBridge {
	const api = exposed(CommonAPI, "CommonAPI");
	return withCleanErrors<HostBridge>({
		getServerUrl: () => api.getServerUrl(),
		getDefaultServerUrl: () => api.getDefaultServerUrl(),
		getSession: () => api.getSession(),
		login: async (serverUrl, onCode) => {
			await withEvents(api.onLoginCode, onCode, () => api.login({ serverBaseUrl: serverUrl }));
		},
		logout: async () => {
			await api.logout();
		},
		onSessionChanged: (listener) => api.onSessionChanged(ignoreResult(listener)),
		getSettings: () => api.getSettings(),
		saveSettings: async (settings) => {
			await api.saveSettings(settings);
		},
		getFileSize: (path) => api.getFileSize(path),
		uploadFile: (path, partSize, parts, onProgress) =>
			withEvents(api.onUploadProgress, onProgress, () => api.uploadFile(path, partSize, parts)),
		openInBrowser: async (path) => {
			await api.openInBrowser(path);
		},
		pickDirectory: () => api.pickDirectory(),
	});
}

export function connectNleBridge(): NleBridge {
	const api = exposed(NleAPI, "NleAPI");
	return withCleanErrors<NleBridge>({
		getCapabilities: async () => fromWireCapabilities(await api.getCapabilities()),
		getProjectId: () => api.getProjectId(),
		getTimelineId: () => api.getTimelineId(),
		getMarkers: async () => (await api.getMarkers()).map(fromWireMarker),
		setMarkers: async (markers) => {
			await api.setMarkers(markers.map(toWireMarker));
		},
		clearMarkers: async () => {
			await api.clearMarkers();
		},
		getRenderPresets: () => api.getRenderPresets(),
		renderPreview: (onProgress) =>
			withEvents(api.onRenderProgress, onProgress, () => api.renderPreview()),
		buildTimelineSnapshot: async () =>
			(await api.buildTimelineSnapshot()) as TimelineSnapshot | null,
	});
}
