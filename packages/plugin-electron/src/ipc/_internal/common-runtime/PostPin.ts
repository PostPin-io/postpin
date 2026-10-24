/* eslint-disable */

export function $eipc_validator$_PaletteColor(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// PaletteColor.id
	if (!(typeof value.id === "string")) return false;

	// PaletteColor.hex
	if (!(typeof value.hex === "string")) return false;

	// PaletteColor.name
	if (typeof value.name !== "undefined") {
		if (!(typeof value.name === "string")) return false;
	}
	return true;
}
export function $eipc_validator$_Capabilities(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// Capabilities.hostName
	if (!(typeof value.hostName === "string")) return false;

	// Capabilities.palette
	if (!(
		Array.isArray(value.palette) &&
		value.palette.every((v: any) => $eipc_validator$_PaletteColor(v))
	))
		return false;

	// Capabilities.anyColor
	if (!(typeof value.anyColor === "boolean")) return false;

	// Capabilities.renderPresets
	if (!(typeof value.renderPresets === "boolean")) return false;

	// Capabilities.renderToDisk
	if (!(typeof value.renderToDisk === "boolean")) return false;

	// Capabilities.snapshotClips
	if (!(typeof value.snapshotClips === "boolean")) return false;

	// Capabilities.customMarkerData
	if (!(typeof value.customMarkerData === "boolean")) return false;
	return true;
}
export function $eipc_validator$_NleMarker(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// NleMarker.title
	if (!(typeof value.title === "string")) return false;

	// NleMarker.description
	if (!(typeof value.description === "string")) return false;

	// NleMarker.frame
	if (!(typeof value.frame === "number")) return false;

	// NleMarker.color
	if (!(typeof value.color === "string")) return false;

	// NleMarker.customData
	if (typeof value.customData !== "undefined") {
		if (!(typeof value.customData === "string")) return false;
	}
	return true;
}
export function $eipc_validator$_RenderProgress(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// RenderProgress.percent
	if (!(typeof value.percent === "number")) return false;

	// RenderProgress.estimatedTimeRemainingMs
	if (!(typeof value.estimatedTimeRemainingMs === "number")) return false;
	return true;
}
export function $eipc_validator$_UploadPartUrl(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// UploadPartUrl.partNumber
	if (!(typeof value.partNumber === "number")) return false;

	// UploadPartUrl.url
	if (!(typeof value.url === "string")) return false;
	return true;
}
export function $eipc_validator$_UploadedPart(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// UploadedPart.partNumber
	if (!(typeof value.partNumber === "number")) return false;

	// UploadedPart.etag
	if (!(typeof value.etag === "string")) return false;
	return true;
}
export function $eipc_validator$_UploadProgress(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// UploadProgress.uploadedBytes
	if (!(typeof value.uploadedBytes === "number")) return false;

	// UploadProgress.totalBytes
	if (!(typeof value.totalBytes === "number")) return false;
	return true;
}
export function $eipc_validator$_Settings(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// Settings.renderToDisk
	if (!(typeof value.renderToDisk === "boolean")) return false;

	// Settings.outputPath
	if (!(typeof value.outputPath === "string")) return false;

	// Settings.filename
	if (!(typeof value.filename === "string")) return false;
	return true;
}
export function $eipc_validator$_LoginConfig(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// LoginConfig.serverBaseUrl
	if (!(typeof value.serverBaseUrl === "string")) return false;
	return true;
}
export function $eipc_validator$_LoginCode(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// LoginCode.userCode
	if (!(typeof value.userCode === "string")) return false;

	// LoginCode.verificationUri
	if (!(typeof value.verificationUri === "string")) return false;
	return true;
}
