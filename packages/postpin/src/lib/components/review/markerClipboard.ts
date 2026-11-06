const STORAGE_KEY = "MarkerClipboard";

/** Only references. The server reads the content itself, the client can't fake it. */
export interface MarkerClipboard {
	sourceExportId: string;
	markerIds: string[];
	mode: "copy" | "cut";
}

export function writeMarkerClipboard(clipboard: MarkerClipboard) {
	if (clipboard.markerIds.length === 0) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(clipboard));
	} catch {
		// private window / storage blocked: copying just doesn't persist
	}
}

export function readMarkerClipboard(): MarkerClipboard | null {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"sourceExportId" in parsed &&
			typeof parsed.sourceExportId === "string" &&
			"markerIds" in parsed &&
			Array.isArray(parsed.markerIds) &&
			parsed.markerIds.every((id) => typeof id === "string") &&
			"mode" in parsed &&
			(parsed.mode === "copy" || parsed.mode === "cut")
		) {
			return parsed as MarkerClipboard;
		}
	} catch {
		// broken JSON or storage blocked
	}
	return null;
}

export function clearMarkerClipboard() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
