import type { Settings } from "@postpin-io/plugin-core/bridge";
import { createStore } from "./store";

export const settingsStore = createStore<{ settings: Settings; useMediaEncoder: boolean }>(
	"settings.json",
	{ settings: { renderToDisk: false, outputPath: "", filename: "" }, useMediaEncoder: true },
);
