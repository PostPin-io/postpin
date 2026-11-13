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

	// NleMarker.nleId
	if (typeof value.nleId !== "undefined") {
		if (!(typeof value.nleId === "string")) return false;
	}

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
export function $eipc_validator$_ProbedMedia(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// ProbedMedia.width
	if (!(typeof value.width === "number")) return false;

	// ProbedMedia.height
	if (!(typeof value.height === "number")) return false;

	// ProbedMedia.rotation
	if (typeof value.rotation !== "undefined") {
		if (!(typeof value.rotation === "number")) return false;
	}

	// ProbedMedia.hasAudio
	if (!(typeof value.hasAudio === "boolean")) return false;

	// ProbedMedia.duration
	if (typeof value.duration !== "undefined") {
		if (!(typeof value.duration === "number")) return false;
	}
	return true;
}
export function $eipc_validator$_Rendition(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// Rendition.width
	if (!(typeof value.width === "number")) return false;

	// Rendition.height
	if (!(typeof value.height === "number")) return false;

	// Rendition.bitRate
	if (!(typeof value.bitRate === "number")) return false;
	return true;
}
export function $eipc_validator$_HlsRange(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// HlsRange.offset
	if (!(typeof value.offset === "number")) return false;

	// HlsRange.length
	if (!(typeof value.length === "number")) return false;
	return true;
}
export function $eipc_validator$_HlsSegment(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// HlsSegment.duration
	if (!(typeof value.duration === "number")) return false;

	// HlsSegment.offset
	if (!(typeof value.offset === "number")) return false;

	// HlsSegment.length
	if (!(typeof value.length === "number")) return false;
	return true;
}
export function $eipc_validator$_HlsInfo(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// HlsInfo.init
	if (!$eipc_validator$_HlsRange(value.init)) return false;

	// HlsInfo.segments
	if (!(
		Array.isArray(value.segments) &&
		value.segments.every((v: any) => $eipc_validator$_HlsSegment(v))
	))
		return false;
	return true;
}
export function $eipc_validator$_EncodedProxy(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// EncodedProxy.path
	if (!(typeof value.path === "string")) return false;

	// EncodedProxy.hls
	if (!$eipc_validator$_HlsInfo(value.hls)) return false;

	// EncodedProxy.bytes
	if (!(typeof value.bytes === "number")) return false;
	return true;
}
export function $eipc_validator$_TimelineInfo(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// TimelineInfo.name
	if (!(typeof value.name === "string")) return false;

	// TimelineInfo.id
	if (!(typeof value.id === "string")) return false;

	// TimelineInfo.projectId
	if (!(typeof value.projectId === "string")) return false;

	// TimelineInfo.projectName
	if (!(typeof value.projectName === "string")) return false;

	// TimelineInfo.thumbnailDataUrl
	if (typeof value.thumbnailDataUrl !== "undefined") {
		if (!(typeof value.thumbnailDataUrl === "string")) return false;
	}
	return true;
}
