const STORAGE_KEY = "ShotGridMode";

/** "cuts": a shot at every cut on any video track. "top": a shot per clip on top. */
export type ShotGridMode = "cuts" | "top";

function load(): ShotGridMode {
	if (typeof localStorage === "undefined") return "cuts";
	try {
		return localStorage.getItem(STORAGE_KEY) === "top" ? "top" : "cuts";
	} catch {
		return "cuts";
	}
}

// One choice for every export, remembered in this browser
class ShotGridModeSetting {
	mode = $state<ShotGridMode>(load());

	set(mode: ShotGridMode) {
		this.mode = mode;
		try {
			localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// private window / storage blocked: the choice just isn't remembered
		}
	}
}

export const shotGridMode = new ShotGridModeSetting();
