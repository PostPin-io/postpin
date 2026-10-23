const STORAGE_KEY = "MarkerClipboard";

export interface ClipboardMarker {
	name: string;
	description: string;
	categoryId: string;
	// Frame distance to the earliest copied marker
	offset: number;
}

// Persisted so copied markers can be pasted into other exports, even after a reload
export function copyMarkers(
	markers: { name: string; description: string | null; categoryId: string; frame: number }[],
) {
	if (markers.length === 0) return;
	const first = Math.min(...markers.map((m) => m.frame));
	const items: ClipboardMarker[] = markers.map((m) => ({
		name: m.name,
		description: m.description ?? "",
		categoryId: m.categoryId,
		offset: m.frame - first,
	}));
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function readMarkerClipboard(): ClipboardMarker[] {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(m): m is ClipboardMarker =>
				typeof m?.name === "string" &&
				typeof m?.description === "string" &&
				typeof m?.categoryId === "string" &&
				Number.isInteger(m?.offset),
		);
	} catch {
		return [];
	}
}
