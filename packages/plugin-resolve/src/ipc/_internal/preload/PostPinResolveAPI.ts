/* eslint-disable */

import { contextBridge, ipcRenderer } from "electron";
export * from "../common/PostPinResolveAPI.js";
import {
	Settings,
	RenderProgress,
	UploadPartUrl,
	UploadedPart,
	UploadProgress,
	Marker,
	MarkerColor,
	LoginConfig,
	LoginCode,
	IMainAPIImpl,
	IMainAPIRenderer,
} from "../common/PostPinResolveAPI.js";
import {
	$eipc_validator$_Settings,
	$eipc_validator$_RenderProgress,
	$eipc_validator$_UploadPartUrl,
	$eipc_validator$_UploadedPart,
	$eipc_validator$_UploadProgress,
	$eipc_validator$_Marker,
	$eipc_validator$_MarkerColor,
	$eipc_validator$_LoginConfig,
	$eipc_validator$_LoginCode,
} from "../common-runtime/PostPinResolveAPI.js";
const $$ipcPrefix$$ = "$eipc_message$_db11898d-8592-472f-b7ae-33b9ba9f8cc0_$_PostPinResolveAPI_$_";
import { webFrame } from "electron/renderer";
function $eipc_event_validator$_MyApp() {
	if (
		("frameToken" in webFrame && webFrame.top && "frameToken" in webFrame.top
			? webFrame.top.frameToken === webFrame.frameToken
			: webFrame.top?.routingId === webFrame.routingId) === true
	)
		return true;
	return false;
}
export const MainAPI: Partial<IMainAPIRenderer> = {
	getRenderPresets() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getRenderPresets");
	},
	renderPreview(targetDirPath: string, targetClipName: string) {
		return ipcRenderer.invoke(
			$$ipcPrefix$$ + "MainAPI_$_renderPreview",
			targetDirPath,
			targetClipName,
		);
	},
	onRenderProgress(fn: (progress: RenderProgress) => void) {
		const handler = (e: unknown, progress: RenderProgress) => fn(progress);
		const $$channel$$ = $$ipcPrefix$$ + "MainAPI_$_renderProgress";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	getFileSize(path: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getFileSize", path);
	},
	uploadRenderedFile(sourcePath: string, partSize: number, parts: UploadPartUrl[]) {
		return ipcRenderer.invoke(
			$$ipcPrefix$$ + "MainAPI_$_uploadRenderedFile",
			sourcePath,
			partSize,
			parts,
		);
	},
	onUploadProgress(fn: (progress: UploadProgress) => void) {
		const handler = (e: unknown, progress: UploadProgress) => fn(progress);
		const $$channel$$ = $$ipcPrefix$$ + "MainAPI_$_uploadProgress";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	openInBrowser(path: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_openInBrowser", path);
	},
	buildTimelineSnapshot() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_buildTimelineSnapshot");
	},
	getLastSettings() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getLastSettings");
	},
	saveSettings(settings: Settings) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_saveSettings", settings);
	},
	pickOutputDirectory() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_pickOutputDirectory");
	},
	getMarkers() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getMarkers");
	},
	setMarkers(markers: Marker[]) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_setMarkers", markers);
	},
	setMarker(marker: Marker) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_setMarker", marker);
	},
	clearMarkers() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_clearMarkers");
	},
	deleteMarker(frame: number) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_deleteMarker", frame);
	},
	getTimelineStartFrame() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getTimelineStartFrame");
	},
	test() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_test");
	},
	getProjectId() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getProjectId");
	},
	getTimelineId() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getTimelineId");
	},
	getSession() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getSession");
	},
	getSessionToken() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_getSessionToken");
	},
	logout() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_logout");
	},
	login(config: LoginConfig) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "MainAPI_$_login", config);
	},
	onLoginCode(fn: (code: LoginCode) => void) {
		const handler = (e: unknown, code: LoginCode) => fn(code);
		const $$channel$$ = $$ipcPrefix$$ + "MainAPI_$_loginCode";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	onSessionChanged(fn: (session: unknown) => void) {
		const handler = (e: unknown, session: unknown) => fn(session);
		const $$channel$$ = $$ipcPrefix$$ + "MainAPI_$_sessionChanged";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
};
const $eipc_impl$__init_MainAPI = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_MyApp()) return;
	localBridged["PostPinResolveAPI"] = localBridged["PostPinResolveAPI"] || {};
	localBridged["PostPinResolveAPI"]["MainAPI"] = MainAPI;
};

// Initialize context bridge
const $$bridged$$ = {} as Record<string, any>;
$eipc_impl$__init_MainAPI($$bridged$$);
for (const [key, value] of Object.entries($$bridged$$)) {
	contextBridge.exposeInMainWorld(key, value);
}
