import { mount } from "svelte";
import { connectHostBridge, connectNleBridge } from "@postpin-io/plugin-electron/renderer";
import App from "@postpin-io/plugin-core/ui/App.svelte";
import "./app.css";

const app = mount(App, {
	target: document.getElementById("app")!,
	props: { nle: connectNleBridge(), host: connectHostBridge() },
});

export default app;
