// Build of the webview UI (a real browser): dist/ui/index.html + ui.js + ui.css
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	publicDir: "ui-public",
	plugins: [tailwindcss(), svelte()],
	define: { "process.env.NODE_ENV": JSON.stringify(mode) },
	build: {
		outDir: "dist/ui",
		emptyOutDir: true,
		minify: mode !== "development",
		sourcemap: mode === "development" ? "inline" : false,
		lib: {
			entry: "src/ui/main.ts",
			formats: ["iife"],
			name: "PostPinUi",
			fileName: () => "ui.js",
			cssFileName: "ui",
		},
	},
}));
