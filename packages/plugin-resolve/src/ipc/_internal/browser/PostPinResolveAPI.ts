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
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_db11898d-8592-472f-b7ae-33b9ba9f8cc0_$_PostPinResolveAPI_$_";
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
	dispatchLoginCode(arg_code: LoginCode): void;
	dispatchSessionChanged(arg_session: unknown): void;
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
		["getSession", [], $eipc$.unknown],
		["getSessionToken", [], $eipc$.string],
		["logout", [], $eipc$.boolean],
		["login", [["config", $eipc_validator$_LoginConfig]], $eipc$.boolean],
	],
	events: [
		["renderProgress", [["progress", $eipc_validator$_RenderProgress]]],
		["uploadProgress", [["progress", $eipc_validator$_UploadProgress]]],
		["loginCode", [["code", $eipc_validator$_LoginCode]]],
		["sessionChanged", [["session", $eipc$.unknown]]],
	],
});
