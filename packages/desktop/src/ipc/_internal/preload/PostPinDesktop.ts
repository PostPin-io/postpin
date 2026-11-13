/* eslint-disable */

import { contextBridge, ipcRenderer } from "electron";
export * from "../common/PostPinDesktop.js";
import {
	HostOption,
	IDesktopAPIImpl,
	IDesktopAPIRenderer,
	AvailableUpdate,
	IUpdaterAPIImpl,
	IUpdaterAPIRenderer,
} from "../common/PostPinDesktop.js";
import {
	$eipc_validator$_HostOption,
	$eipc_validator$_AvailableUpdate,
} from "../common-runtime/PostPinDesktop.js";
const $$ipcPrefix$$ = "$eipc_message$_34dd2204d04cd12e7f7c7b57014b8c0d_$_PostPinDesktop_$_";
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
export const UpdaterAPI: Partial<IUpdaterAPIRenderer> = {
	checkForUpdate() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "UpdaterAPI_$_checkForUpdate");
	},
	downloadUpdate() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "UpdaterAPI_$_downloadUpdate");
	},
	onUpdateProgress(fn: (fraction: number) => void) {
		const handler = (e: unknown, fraction: number) => fn(fraction);
		const $$channel$$ = $$ipcPrefix$$ + "UpdaterAPI_$_updateProgress";
		ipcRenderer.on($$channel$$, handler);
		return () => {
			ipcRenderer.removeListener($$channel$$, handler);
		};
	},
	installUpdate() {
		return ipcRenderer.invoke($$ipcPrefix$$ + "UpdaterAPI_$_installUpdate");
	},
};
const $eipc_impl$__init_UpdaterAPI = (localBridged: Record<string, any>) => {
	if (!$eipc_event_validator$_App()) return;
	localBridged["PostPinDesktop"] = localBridged["PostPinDesktop"] || {};
	localBridged["PostPinDesktop"]["UpdaterAPI"] = UpdaterAPI;
};

// Initialize context bridge
const $$bridged$$ = {} as Record<string, any>;
$eipc_impl$__init_DesktopAPI($$bridged$$);
$eipc_impl$__init_UpdaterAPI($$bridged$$);
for (const [key, value] of Object.entries($$bridged$$)) {
	contextBridge.exposeInMainWorld(key, value);
}
