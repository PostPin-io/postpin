// UXP panel: runs the bridges against Premiere and hosts the plugin-core UI in a webview
import { getServerUrl } from "./bridges/auth";
import { createHostBridge } from "./bridges/hostBridge";
import { createNetBridge } from "./bridges/net";
import { uxp } from "./host";
import { setupMenu } from "./menu";
import { createPremiereBridge } from "./premiere";
import { createRpcServer, parseMessage } from "./rpc";

// set by vite.config.ts
declare const DEV: boolean;
declare const BUILD_TIME: string;

// Which build runs, from where and against which server. The UXP Developer Tool loads the
// manifest path it was given, which isn't necessarily the checkout being built.
async function logStartup() {
	const [folder, serverUrl] = await Promise.all([
		uxp.storage.localFileSystem.getPluginFolder(),
		getServerUrl(),
	]);
	console.log(
		`[PostPin] ${DEV ? "development" : "production"} build from ` +
			// not defined while a `pnpm dev` started before it was added runs
			`${typeof BUILD_TIME === "string" ? BUILD_TIME : "unknown, restart pnpm dev"}\n` +
			`  plugin folder: ${folder.nativePath}\n` +
			`  server: ${serverUrl}\n` +
			`  Premiere ${uxp.host.version}, UXP ${uxp.versions.uxp}`,
	);
}
logStartup().catch((error) => console.error("[PostPin] startup log failed:", error));

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
