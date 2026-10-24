import type { Settings } from "@postpin-io/plugin-core/bridge";
import Store from "electron-store";

export function createSettings() {
	const store = new Store<{ lastSettings?: Partial<Settings> }>();

	return {
		get(): Settings {
			const settings = store.get("lastSettings") ?? {};
			return {
				filename: settings.filename ?? "",
				outputPath: settings.outputPath ?? "",
				renderToDisk: settings.renderToDisk ?? false,
			};
		},
		save(settings: Settings) {
			store.set("lastSettings", settings);
		},
	};
}
