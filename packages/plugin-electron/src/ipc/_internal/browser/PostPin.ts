/* eslint-disable */

import { app as $$app$$ } from "electron";
export * from "../common/PostPin.js";
import {
	PaletteColor,
	Capabilities,
	NleMarker,
	RenderProgress,
	UploadPartUrl,
	UploadedPart,
	UploadProgress,
	Settings,
	LoginConfig,
	LoginCode,
	ProbedMedia,
	Rendition,
	HlsRange,
	HlsSegment,
	HlsInfo,
	EncodedProxy,
	ICommonAPIImpl,
	ICommonAPIRenderer,
	TimelineInfo,
	INleAPIImpl,
	INleAPIRenderer,
} from "../common/PostPin.js";
import {
	$eipc_validator$_PaletteColor,
	$eipc_validator$_Capabilities,
	$eipc_validator$_NleMarker,
	$eipc_validator$_RenderProgress,
	$eipc_validator$_UploadPartUrl,
	$eipc_validator$_UploadedPart,
	$eipc_validator$_UploadProgress,
	$eipc_validator$_Settings,
	$eipc_validator$_LoginConfig,
	$eipc_validator$_LoginCode,
	$eipc_validator$_ProbedMedia,
	$eipc_validator$_Rendition,
	$eipc_validator$_HlsRange,
	$eipc_validator$_HlsSegment,
	$eipc_validator$_HlsInfo,
	$eipc_validator$_EncodedProxy,
	$eipc_validator$_TimelineInfo,
} from "../common-runtime/PostPin.js";
import * as $eipc$ from "../browser-runtime.js";
const $$ipcPrefix$$ = "$eipc_message$_d189e49b54d277201894f5c9d4e5f531_$_PostPin_$_";
// Interfaces are declared as data and wired up by ../browser-runtime.ts:
//   methods: [name, [[argName, validator], ...], resultValidator?]  ([Sync] methods append null|validator, 'sync')
//   stores:  [name, stateValidator]
//   events:  [name, [[argName, validator], ...]]
function $eipc_event_validator$_App(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
	if ((event.senderFrame?.parent === null) === true) return true;
	return false;
}
export interface ICommonAPIDispatcher {
	dispatchLoginCode(arg_code: LoginCode): void;
	dispatchSessionChanged(arg_session: unknown): void;
	dispatchUploadProgress(arg_progress: UploadProgress): void;
	dispatchTranscodeProgress(arg_fraction: number): void;
}
export const CommonAPI = /*#__PURE__*/ $eipc$.defineInterface<
	ICommonAPIImpl,
	ICommonAPIRenderer,
	ICommonAPIDispatcher
>($$ipcPrefix$$, "CommonAPI", $eipc_event_validator$_App, {
	methods: [
		["getServerUrl", [], $eipc$.string],
		["getDefaultServerUrl", [], $eipc$.string],
		["getSession", [], $eipc$.unknown],
		["getToken", [], $eipc$.nullable($eipc$.string)],
		["login", [["config", $eipc_validator$_LoginConfig]], $eipc$.boolean],
		["logout", [], $eipc$.boolean],
		["getSettings", [], $eipc_validator$_Settings],
		["saveSettings", [["settings", $eipc_validator$_Settings]], $eipc$.boolean],
		["getFileSize", [["path", $eipc$.string]], $eipc$.number],
		[
			"uploadFile",
			[
				["path", $eipc$.string],
				["partSize", $eipc$.number],
				["parts", $eipc$.arrayOf($eipc_validator$_UploadPartUrl)],
			],
			$eipc$.arrayOf($eipc_validator$_UploadedPart),
		],
		["openInBrowser", [["path", $eipc$.string]], $eipc$.boolean],
		["pickDirectory", [], $eipc$.string],
		["setProgress", [["fraction", $eipc$.number]], $eipc$.boolean],
		["canTranscode", [], $eipc$.boolean],
		["probe", [["path", $eipc$.string]], $eipc_validator$_ProbedMedia],
		[
			"transcode",
			[
				["input", $eipc$.string],
				["renditions", $eipc$.arrayOf($eipc_validator$_Rendition)],
				["hasAudio", $eipc$.boolean],
			],
			$eipc$.arrayOf($eipc_validator$_EncodedProxy),
		],
		["removeFile", [["path", $eipc$.string]], $eipc$.boolean],
	],
	events: [
		["loginCode", [["code", $eipc_validator$_LoginCode]]],
		["sessionChanged", [["session", $eipc$.unknown]]],
		["uploadProgress", [["progress", $eipc_validator$_UploadProgress]]],
		["transcodeProgress", [["fraction", $eipc$.number]]],
	],
});
export interface INleAPIDispatcher {
	dispatchRenderProgress(arg_progress: RenderProgress): void;
}
export const NleAPI = /*#__PURE__*/ $eipc$.defineInterface<
	INleAPIImpl,
	INleAPIRenderer,
	INleAPIDispatcher
>($$ipcPrefix$$, "NleAPI", $eipc_event_validator$_App, {
	methods: [
		["getCapabilities", [], $eipc_validator$_Capabilities],
		["getProjectId", [], $eipc$.string],
		["getTimelineInfo", [], $eipc$.nullable($eipc_validator$_TimelineInfo)],
		["getMarkers", [], $eipc$.arrayOf($eipc_validator$_NleMarker)],
		[
			"setMarkers",
			[["markers", $eipc$.arrayOf($eipc_validator$_NleMarker)]],
			$eipc$.arrayOf($eipc$.string),
		],
		["clearMarkers", [], $eipc$.boolean],
		["getRenderPresets", [], $eipc$.arrayOf($eipc$.string)],
		["renderPreview", [], $eipc$.string],
		["buildTimelineSnapshot", [], $eipc$.unknown],
	],
	events: [["renderProgress", [["progress", $eipc_validator$_RenderProgress]]]],
});
