import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	root: "src/ui",
	base: "./",
	plugins: [
		tailwindcss(),
		// root is src/ui, so point at the package-root config (svelte-check reads it from there too)
		svelte({ configFile: fileURLToPath(new URL("svelte.config.js", import.meta.url)) }),
	],
	server: { port: 5183, strictPort: true },
	build: { outDir: "../../dist/ui", emptyOutDir: true },
});
