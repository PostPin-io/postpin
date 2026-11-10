import { settingsStore } from "./bridges/settings";
import { uxp } from "./host";

const PANEL_ID = "postpin.panel";
const MEDIA_ENCODER = "useMediaEncoder";

// The panel's ☰ menu, with the render engine as a checkable item
export function setupMenu() {
	uxp.entrypoints.setup({
		panels: {
			[PANEL_ID]: {
				// required by setup; main.ts mounts the webview into #app itself
				show() {},
				menuItems: [{ id: MEDIA_ENCODER, label: "Render with Media Encoder", checked: true }],
				async invokeMenu(id: string) {
					if (id !== MEDIA_ENCODER) return;
					const { useMediaEncoder } = await settingsStore.read();
					await settingsStore.update({ useMediaEncoder: !useMediaEncoder });
					showChecked(!useMediaEncoder);
				},
			},
		},
	});
	void settingsStore.read().then(({ useMediaEncoder }) => showChecked(useMediaEncoder));
}

function showChecked(checked: boolean) {
	const item = uxp.entrypoints.getPanel(PANEL_ID)?.menuItems.getItem(MEDIA_ENCODER);
	if (item) item.checked = checked;
}
