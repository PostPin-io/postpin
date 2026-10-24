/* eslint-disable */

import { contextBridge, ipcRenderer } from "electron";
export * from "../common/PostPin.js";
import {
	PaletteColor,
	Capabilities,
	NleMarker,
	RenderProgress,
	UploadPartUrl,
	UploadedPart,
	UploadProgress,
	Settings,
	LoginConfig,
	LoginCode,
	ICommonAPIImpl,
	ICommonAPIRenderer,
	INleAPIImpl,
	INleAPIRenderer,
} from "../common/PostPin.js";
import {
	$eipc_validator$_PaletteColor,
	$eipc_validator$_Capabilities,
	$eipc_validator$_NleMarker,
	$eipc_validator$_RenderProgress,
	$eipc_validator$_UploadPartUrl,
	$eipc_validator$_UploadedPart,
	$eipc_validator$_UploadProgress,
	$eipc_validator$_Settings,
	$eipc_validator$_LoginConfig,
	$eipc_validator$_LoginCode,
} from "../common-runtime/PostPin.js";
const $$ipcPrefix$$ = "$eipc_message$_bcb95dc01602d580c779b4c488f4ed0a_$_PostPin_$_";
import { webFrame } from "electron/renderer";
function $eipc_event_validator$_App() {
	if (
		("frameToken" in webFrame && webFrame.top && "frameToken" in webFrame.top
			? webFrame.top.frameToken === webFrame.frameToken
			: webFrame.top?.routingId === webFrame.routingId) === true
	)
		return true;
	return false;
}
export const CommonAPI: Partial<ICommonAPIRenderer> = {
	getServerUrl() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_getServerUrl");
	},
	getDefaultServerUrl() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_getDefaultServerUrl");
	},
	getSession() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_getSession");
	},
	login(config: LoginConfig) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_login", config);
	},
	logout() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_logout");
	},
	onLoginCode(fn: (code: LoginCode) => void) {
		const handler = (e: unknown, code: LoginCode) => fn(code);
		const $$channel$$ = $$ipcPrefix$$ + "CommonAPI_$_loginCode";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	onSessionChanged(fn: (session: unknown) => void) {
		const handler = (e: unknown, session: unknown) => fn(session);
		const $$channel$$ = $$ipcPrefix$$ + "CommonAPI_$_sessionChanged";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	getSettings() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_getSettings");
	},
	saveSettings(settings: Settings) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_saveSettings", settings);
	},
	getFileSize(path: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_getFileSize", path);
	},
	uploadFile(path: string, partSize: number, parts: UploadPartUrl[]) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_uploadFile", path, partSize, parts);
	},
	onUploadProgress(fn: (progress: UploadProgress) => void) {
		const handler = (e: unknown, progress: UploadProgress) => fn(progress);
		const $$channel$$ = $$ipcPrefix$$ + "CommonAPI_$_uploadProgress";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	openInBrowser(path: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_openInBrowser", path);
	},
	pickDirectory() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "CommonAPI_$_pickDirectory");
	},
};
const $eipc_impl$__init_CommonAPI = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_App()) return;
	localBridged["PostPin"] = localBridged["PostPin"] || {};
	localBridged["PostPin"]["CommonAPI"] = CommonAPI;
};
export const NleAPI: Partial<INleAPIRenderer> = {
	getCapabilities() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_getCapabilities");
	},
	getProjectId() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_getProjectId");
	},
	getTimelineId() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_getTimelineId");
	},
	getMarkers() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_getMarkers");
	},
	setMarkers(markers: NleMarker[]) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_setMarkers", markers);
	},
	clearMarkers() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_clearMarkers");
	},
	getRenderPresets() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_getRenderPresets");
	},
	renderPreview() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_renderPreview");
	},
	onRenderProgress(fn: (progress: RenderProgress) => void) {
		const handler = (e: unknown, progress: RenderProgress) => fn(progress);
		const $$channel$$ = $$ipcPrefix$$ + "NleAPI_$_renderProgress";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	buildTimelineSnapshot() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "NleAPI_$_buildTimelineSnapshot");
	},
};
const $eipc_impl$__init_NleAPI = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_App()) return;
	localBridged["PostPin"] = localBridged["PostPin"] || {};
	localBridged["PostPin"]["NleAPI"] = NleAPI;
};

// Initialize context bridge
const $$bridged$$ = {} as Record<string, any>;
$eipc_impl$__init_CommonAPI($$bridged$$);
$eipc_impl$__init_NleAPI($$bridged$$);
for (const [key, value] of Object.entries($$bridged$$)) {
	contextBridge.exposeInMainWorld(key, value);
}
