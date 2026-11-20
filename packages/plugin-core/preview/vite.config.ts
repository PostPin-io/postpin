// The plugin's panel in a plain browser, with demo data instead of a program and a server. For
// screenshots (scripts/screenshots.ts) and for looking at the panel without opening a program.
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [
		tailwindcss(),
		svelte({ configFile: fileURLToPath(new URL("../svelte.config.js", import.meta.url)) }),
	],
	optimizeDeps: { include: ["delta-e"] },
	server: { port: 5184 },
});
