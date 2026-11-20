// Screenshots of the plugin's panel for the web app's plugin tutorial (sync-to-nle), one per
// program, made from the real panel with demo data (preview/). Run it after changing the panel:
//   pnpm --filter @postpin-io/plugin-core run screenshots
// Writes postpin's static/guides/plugin-panel/<program>.png and the areas the tutorial highlights
// (data-guide="sync-to-nle/…" in the panel) to src/lib/components/guides/tutorials/plugin-panel.json.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { createServer } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const postpin = here("../../postpin/");
const areasFile = `${postpin}src/lib/components/guides/tutorials/plugin-panel.json`;
const PROGRAMS = ["resolve", "premiere", "protools"];

const server = await createServer({
	configFile: here("../preview/vite.config.ts"),
	server: { port: 0 },
	logLevel: "warn",
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("The preview server didn't start");

console.log("Capturing the plugin panel…");
const code = await new Promise((resolve) => {
	const child = spawn(
		electron,
		[here("capture.mjs"), url, `${postpin}static/guides/plugin-panel`, areasFile, ...PROGRAMS],
		{ stdio: "inherit" },
	);
	child.on("exit", resolve);
});
await server.close();
if (code === 0) {
	// in the web app's code style (with its prettier and config), so its lint passes
	spawnSync("pnpm", ["exec", "prettier", "--write", areasFile], { cwd: postpin, stdio: "ignore" });
	console.log("Done: postpin/static/guides/plugin-panel/ and plugin-panel.json");
}
process.exit(code ?? 1);
