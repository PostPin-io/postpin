/* eslint-disable */

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
export function $eipc_validator$_Marker(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// Marker.title
	if (!(typeof value.title === "string")) return false;

	// Marker.description
	if (!(typeof value.description === "string")) return false;

	// Marker.frame
	if (!(typeof value.frame === "number")) return false;

	// Marker.color
	if (!$eipc_validator$_MarkerColor(value.color)) return false;

	// Marker.customData
	if (!(typeof value.customData === "string")) return false;
	return true;
}
const $eipc_validator$_MarkerColor_values = new Set([
	"Blue",
	"Cyan",
	"Green",
	"Yellow",
	"Red",
	"Pink",
	"Purple",
	"Fuchsia",
	"Rose",
	"Lavender",
	"Sky",
	"Mint",
	"Lemon",
	"Sand",
	"Cocoa",
	"Cream",
]);
export function $eipc_validator$_MarkerColor(value: any): boolean {
	return $eipc_validator$_MarkerColor_values.has(value);
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
