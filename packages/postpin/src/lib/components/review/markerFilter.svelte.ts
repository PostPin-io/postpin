const STORAGE_KEY = "CategoryFilter";

function load(): string[] {
	if (typeof localStorage === "undefined") return [];
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === "string");
	} catch {
		// Older versions stored a single plain category id
	}
	return [raw];
}

// Shared between the marker panel, the video player and the timeline
class MarkerFilter {
	categoryIds = $state<string[]>(load());

	isActive(categoryId: string) {
		return this.categoryIds.includes(categoryId);
	}

	toggle(categoryId: string) {
		this.categoryIds = this.isActive(categoryId)
			? this.categoryIds.filter((id) => id !== categoryId)
			: [...this.categoryIds, categoryId];
		this.save();
	}

	clear() {
		this.categoryIds = [];
		this.save();
	}

	apply<T extends { categoryId: string }>(markers: T[]): T[] {
		if (this.categoryIds.length === 0) return markers;
		return markers.filter((m) => this.categoryIds.includes(m.categoryId));
	}

	private save() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.categoryIds));
	}
}

export const markerFilter = new MarkerFilter();
