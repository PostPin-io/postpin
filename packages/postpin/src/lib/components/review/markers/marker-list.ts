export type SortField = "updatedAt" | "createdAt" | "user" | "timecode";
export type SortDirection = "asc" | "desc";

type SortableMarker = {
	updatedAt: Date | string;
	createdAt: Date | string;
	frame: number;
	author?: { name: string } | null;
	/** Share-link guests have no account: their name stands in for the author's */
	guest?: { name: string | null } | null;
};

const userName = (m: SortableMarker) => m.guest?.name ?? m.author?.name ?? "";

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
				return userName(a).localeCompare(userName(b));
			case "timecode":
				return a.frame - b.frame;
		}
	};
	return [...list].sort((a, b) => dir * compare(a, b));
}

/** How the marker list shows dates: short on the card, with the time in its tooltip */
export const markerDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short" });
export const markerDateTimeFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

type SearchableMarker = {
	name: string;
	description?: string | null;
	responses: { content: string }[];
	author?: { name: string } | null;
	guest?: { name: string | null } | null;
	createdAt?: Date | string;
};

/** Everything a search can hit; dates as the list shows them, so a typed date is found */
function searchableTexts(m: SearchableMarker): string[] {
	const texts = [m.name, m.description ?? "", ...m.responses.map((r) => r.content)];
	if (m.author?.name) texts.push(m.author.name);
	if (m.guest?.name) texts.push(m.guest.name);
	if (m.createdAt) {
		const created = new Date(m.createdAt);
		texts.push(markerDateFormat.format(created), markerDateTimeFormat.format(created));
	}
	return texts;
}

/** Case-insensitive search in name, description, responses, author and creation date. */
export function searchMarkers<T extends SearchableMarker>(markers: T[], search: string): T[] {
	const query = search.trim().toLowerCase();
	return markers.filter((m) =>
		searchableTexts(m).some((text) => text.toLowerCase().includes(query)),
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

/**
 * The user's own marker with exactly this range: adding one there again selects it instead.
 * Someone else's marker on the same frame doesn't keep the user from adding their own.
 */
export function ownMarkerAt<T extends { frame: number; duration: number; isOwn: boolean }>(
	markers: T[],
	range: { frame: number; duration: number },
): T | undefined {
	return markers.find((m) => m.isOwn && m.frame === range.frame && m.duration === range.duration);
}
