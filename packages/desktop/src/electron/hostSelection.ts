import Store from "electron-store";
import { ADAPTERS, selectHost } from "../adapters";

// Separate file from plugin-electron's settings store
const store = new Store<{ selectedHost?: string }>({ name: "desktop" });

// Selects the program picked last time, or the first one when it's gone (or nothing was picked)
export function restoreSelectedHost() {
	try {
		selectHost(store.get("selectedHost") ?? ADAPTERS[0].id);
	} catch {
		selectHost(ADAPTERS[0].id);
	}
}

export function selectAndSaveHost(id: string) {
	selectHost(id);
	store.set("selectedHost", id);
}
