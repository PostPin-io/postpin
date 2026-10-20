/* eslint-disable */

import { app as $$app$$ } from "electron";
export * from "../common/PostPinResolveAPI.js";
import {
	Settings,
	RenderProgress,
	UploadPartUrl,
	UploadedPart,
	UploadProgress,
	IMainAPIImpl,
	IMainAPIRenderer,
} from "../common/PostPinResolveAPI.js";
import {
	$eipc_validator$_Settings,
	$eipc_validator$_RenderProgress,
	$eipc_validator$_UploadPartUrl,
	$eipc_validator$_UploadedPart,
	$eipc_validator$_UploadProgress,
} from "../common-runtime/PostPinResolveAPI.js";
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_614bedfc-fcf5-4af9-991d-b7027b00fd1c_$_PostPinResolveAPI_$_";
// Interfaces are declared as data and wired up by ../browser-runtime.ts:
//   methods: [name, [[argName, validator], ...], resultValidator?]  ([Sync] methods append null|validator, 'sync')
//   stores:  [name, stateValidator]
//   events:  [name, [[argName, validator], ...]]
function $eipc_event_validator$_MyApp(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
	if ((event.senderFrame?.parent === null) === true) return true;
	return false;
}
export interface IMainAPIDispatcher {
	dispatchRenderProgress(arg_progress: RenderProgress): void;
	dispatchUploadProgress(arg_progress: UploadProgress): void;
}
export const MainAPI = /*#__PURE__*/ $eipc$.defineInterface<
	IMainAPIImpl,
	IMainAPIRenderer,
	IMainAPIDispatcher
>($$ipcPrefix$$, "MainAPI", $eipc_event_validator$_MyApp, {
	methods: [
		["getRenderPresets", [], $eipc$.arrayOf($eipc$.string)],
		[
			"renderPreview",
			[
				["targetDirPath", $eipc$.string],
				["targetClipName", $eipc$.string],
			],
			$eipc$.string,
		],
		["getFileSize", [["path", $eipc$.string]], $eipc$.number],
		[
			"uploadRenderedFile",
			[
				["sourcePath", $eipc$.string],
				["partSize", $eipc$.number],
				["parts", $eipc$.arrayOf($eipc_validator$_UploadPartUrl)],
			],
			$eipc$.arrayOf($eipc_validator$_UploadedPart),
		],
		["openInBrowser", [["path", $eipc$.string]], $eipc$.boolean],
		["buildTimelineSnapshot", [], $eipc$.unknown],
		["getLastSettings", [], $eipc_validator$_Settings],
		["saveSettings", [["settings", $eipc_validator$_Settings]], $eipc$.boolean],
		["pickOutputDirectory", [], $eipc$.string],
	],
	events: [
		["renderProgress", [["progress", $eipc_validator$_RenderProgress]]],
		["uploadProgress", [["progress", $eipc_validator$_UploadProgress]]],
	],
});
