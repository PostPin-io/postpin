const STORAGE_KEY = "MarkerClipboard";

export interface ClipboardResponse {
	content: string;
	authorId: string;
	createdAt: string;
}

export interface ClipboardMarker {
	name: string;
	description: string;
	categoryId: string;
	// Frame distance to the earliest copied marker
	offset: number;
	responses: ClipboardResponse[];
}

type CopyableMarker = {
	name: string;
	description: string | null;
	categoryId: string;
	frame: number;
	responses: { content: string; authorId: string; createdAt: Date | string }[];
};

// Persisted so copied markers can be pasted into other exports, even after a reload
export function copyMarkers(markers: CopyableMarker[]) {
	if (markers.length === 0) return;
	const first = Math.min(...markers.map((m) => m.frame));
	const items: ClipboardMarker[] = markers.map((m) => ({
		name: m.name,
		description: m.description ?? "",
		categoryId: m.categoryId,
		offset: m.frame - first,
		responses: m.responses.map((r) => ({
			content: r.content,
			authorId: r.authorId,
			createdAt: new Date(r.createdAt).toISOString(),
		})),
	}));
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function readMarkerClipboard(): ClipboardMarker[] {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(m) =>
					typeof m?.name === "string" &&
					typeof m?.description === "string" &&
					typeof m?.categoryId === "string" &&
					Number.isInteger(m?.offset),
			)
			.map((m): ClipboardMarker => ({
				...m,
				// Older clipboards were stored without responses
				responses: Array.isArray(m.responses)
					? m.responses.filter(
							(r: ClipboardResponse) =>
								typeof r?.content === "string" &&
								typeof r?.authorId === "string" &&
								!Number.isNaN(Date.parse(r?.createdAt)),
						)
					: [],
			}));
	} catch {
		return [];
	}
}
