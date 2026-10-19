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
