/* eslint-disable */

import { app as $$app$$ } from "electron";
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
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_34dd2204d04cd12e7f7c7b57014b8c0d_$_PostPinDesktop_$_";
// Interfaces are declared as data and wired up by ../browser-runtime.ts:
//   methods: [name, [[argName, validator], ...], resultValidator?]  ([Sync] methods append null|validator, 'sync')
//   stores:  [name, stateValidator]
//   events:  [name, [[argName, validator], ...]]
function $eipc_event_validator$_App(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
	if ((event.senderFrame?.parent === null) === true) return true;
	return false;
}
export interface IDesktopAPIDispatcher {}
export const DesktopAPI = /*#__PURE__*/ $eipc$.defineInterface<
	IDesktopAPIImpl,
	IDesktopAPIRenderer,
	IDesktopAPIDispatcher
>($$ipcPrefix$$, "DesktopAPI", $eipc_event_validator$_App, {
	methods: [
		["listHosts", [], $eipc$.arrayOf($eipc_validator$_HostOption)],
		["getSelectedHost", [], $eipc$.string],
		["selectHost", [["id", $eipc$.string]], $eipc$.boolean],
	],
});
export interface IUpdaterAPIDispatcher {
	dispatchUpdateProgress(arg_fraction: number): void;
}
export const UpdaterAPI = /*#__PURE__*/ $eipc$.defineInterface<
	IUpdaterAPIImpl,
	IUpdaterAPIRenderer,
	IUpdaterAPIDispatcher
>($$ipcPrefix$$, "UpdaterAPI", $eipc_event_validator$_App, {
	methods: [
		["checkForUpdate", [], $eipc$.nullable($eipc_validator$_AvailableUpdate)],
		["downloadUpdate", [], $eipc$.boolean],
		["installUpdate", [], $eipc$.boolean],
	],
	events: [["updateProgress", [["fraction", $eipc$.number]]]],
});
