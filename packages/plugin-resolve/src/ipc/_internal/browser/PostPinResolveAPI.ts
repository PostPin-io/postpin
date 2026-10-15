/* eslint-disable */

import { app as $$app$$ } from "electron";
export * from "../common/PostPinResolveAPI.js";
import { ISettingsImpl, ISettingsRenderer } from "../common/PostPinResolveAPI.js";
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_ecf3288e-0015-43a2-b01d-6a32530f7735_$_PostPinResolveAPI_$_";
// Interfaces are declared as data and wired up by ../browser-runtime.ts:
//   methods: [name, [[argName, validator], ...], resultValidator?]  ([Sync] methods append null|validator, 'sync')
//   stores:  [name, stateValidator]
//   events:  [name, [[argName, validator], ...]]
function $eipc_event_validator$_MyApp(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
	if ((event.senderFrame?.parent === null) === true) return true;
	return false;
}
export interface ISettingsDispatcher {}
export const Settings = /*#__PURE__*/ $eipc$.defineInterface<
	ISettingsImpl,
	ISettingsRenderer,
	ISettingsDispatcher
>($$ipcPrefix$$, "Settings", $eipc_event_validator$_MyApp, {
	methods: [
		["getRenderPresets", [], $eipc$.arrayOf($eipc$.string)],
		[
			"renderTimeline",
			[
				["timelineName", $eipc$.string],
				["renderPresetName", $eipc$.string],
				["targetDirPath", $eipc$.string],
				["targetClipName", $eipc$.string],
			],
			$eipc$.string,
		],
		[
			"uploadRenderedFile",
			[
				["sourcePath", $eipc$.string],
				["uploadUrl", $eipc$.string],
			],
			$eipc$.boolean,
		],
		["openInBrowser", [["path", $eipc$.string]], $eipc$.boolean],
	],
});
