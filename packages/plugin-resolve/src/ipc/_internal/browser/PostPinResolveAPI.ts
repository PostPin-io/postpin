/* eslint-disable */

import { app as $$app$$ } from "electron";
export * from "../common/PostPinResolveAPI.js";
import {
	Settings,
	RenderProgress,
	UploadPartUrl,
	UploadedPart,
	UploadProgress,
	Marker,
	MarkerColor,
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
} from "../common-runtime/PostPinResolveAPI.js";
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_f2445539-522e-4108-9091-5aae84a1ddd2_$_PostPinResolveAPI_$_";
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
		["getMarkers", [], $eipc$.arrayOf($eipc_validator$_Marker)],
		["setMarkers", [["markers", $eipc$.arrayOf($eipc_validator$_Marker)]], $eipc$.boolean],
		["setMarker", [["marker", $eipc_validator$_Marker]], $eipc$.boolean],
		["clearMarkers", [], $eipc$.boolean],
		["deleteMarker", [["frame", $eipc$.number]], $eipc$.boolean],
		["getTimelineStartFrame", [], $eipc$.number],
		["test", [], $eipc$.boolean],
		["getProjectId", [], $eipc$.string],
		["getTimelineId", [], $eipc$.string],
	],
	events: [
		["renderProgress", [["progress", $eipc_validator$_RenderProgress]]],
		["uploadProgress", [["progress", $eipc_validator$_UploadProgress]]],
	],
});
