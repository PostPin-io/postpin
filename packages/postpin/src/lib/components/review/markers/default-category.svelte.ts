const STORAGE_KEY = "DefaultCategory";

function load(): string {
	if (typeof localStorage === "undefined") return "";
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

// The category new markers get; shared by the marker panel, the marker editor and the video menu bar
class DefaultCategory {
	id = $state(load());

	set(id: string) {
		this.id = id;
		try {
			localStorage.setItem(STORAGE_KEY, id);
		} catch {
			// private window / storage blocked: the choice just isn't remembered
		}
	}
}

export const defaultCategory = new DefaultCategory();
