/* eslint-disable */

import { contextBridge, ipcRenderer } from "electron";
export * from "../common/PostPinResolveAPI.js";
import { ISettingsImpl, ISettingsRenderer } from "../common/PostPinResolveAPI.js";
const $$ipcPrefix$$ = "$eipc_message$_fe40886d-0e68-467a-ba85-5c29b03263fc_$_PostPinResolveAPI_$_";
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
export const Settings: Partial<ISettingsRenderer> = {
	getRenderPresets() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "Settings_$_getRenderPresets");
	},
	renderTimeline(
		timelineName: string,
		renderPresetName: string,
		targetDirPath: string,
		targetClipName: string,
	) {
		return ipcRenderer.invoke(
			$$ipcPrefix$$ + "Settings_$_renderTimeline",
			timelineName,
			renderPresetName,
			targetDirPath,
			targetClipName,
		);
	},
	uploadRenderedFile(sourcePath: string, uploadUrl: string) {
		return ipcRenderer.invoke(
			$$ipcPrefix$$ + "Settings_$_uploadRenderedFile",
			sourcePath,
			uploadUrl,
		);
	},
	openInBrowser(path: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "Settings_$_openInBrowser", path);
	},
};
const $eipc_impl$__init_Settings = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_MyApp()) return;
	localBridged["PostPinResolveAPI"] = localBridged["PostPinResolveAPI"] || {};
	localBridged["PostPinResolveAPI"]["Settings"] = Settings;
};

// Initialize context bridge
const $$bridged$$ = {} as Record<string, any>;
$eipc_impl$__init_Settings($$bridged$$);
for (const [key, value] of Object.entries($$bridged$$)) {
	contextBridge.exposeInMainWorld(key, value);
}
