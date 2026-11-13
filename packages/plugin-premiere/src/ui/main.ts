// Webview entry: the shared plugin-core UI, with bridges that forward to the UXP panel
import { mount } from "svelte";
import App from "@postpin-io/plugin-core/ui/App.svelte";
import type { HostBridge, NleBridge } from "@postpin-io/plugin-core/bridge";
import type { NetBridge } from "../netWire";
import { createRpcClient, parseMessage } from "../rpc";
import { createPanelFetch } from "./panelFetch";
import "./app.css";

declare global {
	interface Window {
		uxpHost: { postMessage(message: unknown): void };
	}
}

const rpc = createRpcClient((msg) => window.uxpHost.postMessage(msg));
window.addEventListener("message", (event) => {
	const msg = parseMessage(event.data);
	if (msg) rpc.handle(msg);
});

/** The host's optional functions; the panel tells which exist (its proxy answers every name) */
const OPTIONAL = ["updater", "probe", "transcode", "removeFile"] as const;

async function start() {
	const present = new Set(
		await rpc.proxy<{ hostFeatures(): Promise<string[]> }>("features").hostFeatures(),
	);
	mount(App, {
		target: document.getElementById("app")!,
		props: {
			nle: rpc.proxy<NleBridge>("nle"),
			// Premiere doesn't update itself; probe/transcode/removeFile exist when the addon loaded
			host: rpc.proxy<HostBridge>("host", {
				absent: OPTIONAL.filter((name) => !present.has(name)),
			}),
			// Premiere draws the panel frame, there are no window buttons to make room for
			titleBarInset: false,
			// macOS blocks http in the webview and the server has no CORS, so the panel fetches
			fetch: createPanelFetch(rpc.proxy<NetBridge>("net")),
		},
	});
}

void start();
