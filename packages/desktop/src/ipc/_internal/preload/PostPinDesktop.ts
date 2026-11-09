/* eslint-disable */

import { contextBridge, ipcRenderer } from "electron";
export * from "../common/PostPinDesktop.js";
import { HostOption, IDesktopAPIImpl, IDesktopAPIRenderer } from "../common/PostPinDesktop.js";
import { $eipc_validator$_HostOption } from "../common-runtime/PostPinDesktop.js";
const $$ipcPrefix$$ = "$eipc_message$_19699063b6880a3ae02388e397f6b06c_$_PostPinDesktop_$_";
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
export const DesktopAPI: Partial<IDesktopAPIRenderer> = {
	listHosts() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "DesktopAPI_$_listHosts");
	},
	getSelectedHost() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "DesktopAPI_$_getSelectedHost");
	},
	selectHost(id: string) {
		return ipcRenderer.invoke($$ipcPrefix$$ + "DesktopAPI_$_selectHost", id);
	},
};
const $eipc_impl$__init_DesktopAPI = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_App()) return;
	localBridged["PostPinDesktop"] = localBridged["PostPinDesktop"] || {};
	localBridged["PostPinDesktop"]["DesktopAPI"] = DesktopAPI;
};

// Initialize context bridge
const $$bridged$$ = {} as Record<string, any>;
$eipc_impl$__init_DesktopAPI($$bridged$$);
for (const [key, value] of Object.entries($$bridged$$)) {
	contextBridge.exposeInMainWorld(key, value);
}
