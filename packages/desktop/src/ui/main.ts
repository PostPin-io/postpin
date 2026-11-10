import { mount } from "svelte";
import { connectHostBridge, connectNleBridge } from "@postpin-io/plugin-electron/renderer";
import DesktopApp from "./DesktopApp.svelte";
import "./app.css";

const app = mount(DesktopApp, {
	target: document.getElementById("app")!,
	props: { nle: connectNleBridge(), host: connectHostBridge() },
});

export default app;
