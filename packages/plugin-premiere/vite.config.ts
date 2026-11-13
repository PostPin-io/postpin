// Build of the UXP panel: dist/main.js, which runs the bridges and hosts the webview
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	define: {
		"process.env.NODE_ENV": JSON.stringify(mode),
		// development builds allow the webview inspector
		DEV: JSON.stringify(mode === "development"),
		// logged at startup, to tell which build Premiere runs
		BUILD_TIME: JSON.stringify(new Date().toISOString()),
		DEFAULT_SERVER_URL: JSON.stringify(
			mode === "development" ? "http://localhost:5173" : "https://postpin.io",
		),
	},
	build: {
		outDir: "dist",
		// dist/ui comes from vite.ui.config.ts and must survive panel rebuilds
		emptyOutDir: false,
		minify: mode !== "development",
		sourcemap: mode === "development" ? "inline" : false,
		lib: { entry: "src/main.ts", formats: ["cjs"], fileName: () => "main.js" },
		// provided by UXP at runtime; the addon is resolved through manifest.json's "addon"
		rolldownOptions: { external: ["premierepro", "uxp", "fs", "os", "postpin-process.uxpaddon"] },
	},
}));
