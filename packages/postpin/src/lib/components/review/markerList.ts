export type SortField = "updatedAt" | "createdAt" | "user" | "timecode";
export type SortDirection = "asc" | "desc";

type SortableMarker = {
	updatedAt: Date | string;
	createdAt: Date | string;
	frame: number;
	author?: { name: string } | null;
};

/** Sorted copy of `list`; the input stays untouched. */
export function sortMarkers<T extends SortableMarker>(
	list: T[],
	field: SortField,
	direction: SortDirection,
): T[] {
	const dir = direction === "asc" ? 1 : -1;
	const compare = (a: T, b: T) => {
		switch (field) {
			case "updatedAt":
				return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
			case "createdAt":
				return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			case "user":
				return (a.author?.name ?? "").localeCompare(b.author?.name ?? "");
			case "timecode":
				return a.frame - b.frame;
		}
	};
	return [...list].sort((a, b) => dir * compare(a, b));
}

type SearchableMarker = {
	name: string;
	description?: string | null;
	responses: { content: string }[];
};

/** Case-insensitive search in name, description and responses. */
export function searchMarkers<T extends SearchableMarker>(markers: T[], search: string): T[] {
	const query = search.trim().toLowerCase();
	return markers.filter((m) =>
		[m.name, m.description ?? "", ...m.responses.map((r) => r.content)].some((text) =>
			text.toLowerCase().includes(query),
		),
	);
}
/**
 * Category filter AND text search, applied together.
 * No category selected = all categories; empty search = no text filter.
 */
export function filterMarkers<T extends SearchableMarker & { categoryId: string }>(
	markers: T[],
	categoryIds: string[],
	search: string,
): T[] {
	const inCategories =
		categoryIds.length === 0 ? markers : markers.filter((m) => categoryIds.includes(m.categoryId));
	return searchMarkers(inCategories, search);
}

/**
 * Shift-click selection: everything between `anchorId` and `id` in display order.
 * Without a usable anchor, only `id` is selected and becomes the new anchor.
 */
export function selectRange(
	orderedIds: string[],
	anchorId: string | null,
	id: string,
): { selected: string[]; anchor: string | null } {
	const from = anchorId ? orderedIds.indexOf(anchorId) : -1;
	const to = orderedIds.indexOf(id);
	if (from === -1 || to === -1) return { selected: [id], anchor: id };
	return {
		selected: orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1),
		anchor: anchorId,
	};
}
