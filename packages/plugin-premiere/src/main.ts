// UXP panel: runs the bridges against Premiere and hosts the plugin-core UI in a webview
import { createHostBridge } from "./bridges/hostBridge";
import { createNetBridge } from "./bridges/net";
import { setupMenu } from "./menu";
import { createPremiereBridge } from "./premiere";
import { createRpcServer, parseMessage } from "./rpc";

// set by vite.config.ts
declare const DEV: boolean;

setupMenu();

const nle = createPremiereBridge();
const host = createHostBridge();

const webview = document.createElement("webview") as HTMLElement & {
	postMessage(message: unknown, targetOrigin?: string): void;
};
webview.setAttribute("src", "./ui/index.html");
if (DEV) webview.setAttribute("uxpAllowInspector", "true");
webview.style.width = "100%";
webview.style.height = "100%";
webview.addEventListener("loaderror", (e: any) =>
	console.error("[webview] loaderror", e.url, e.code, e.message),
);
document.getElementById("app")!.appendChild(webview);

const handle = createRpcServer({ nle, host, net: createNetBridge() }, (msg) =>
	webview.postMessage(msg, "*"),
);
window.addEventListener("message", (event: MessageEvent) => {
	const msg = parseMessage(event.data);
	if (msg) void handle(msg);
});
