/* eslint-disable */

import { app as $$app$$ } from "electron";
export * from "../common/PostPinDesktop.js";
import { HostOption, IDesktopAPIImpl, IDesktopAPIRenderer } from "../common/PostPinDesktop.js";
import { $eipc_validator$_HostOption } from "../common-runtime/PostPinDesktop.js";
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_19699063b6880a3ae02388e397f6b06c_$_PostPinDesktop_$_";
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
