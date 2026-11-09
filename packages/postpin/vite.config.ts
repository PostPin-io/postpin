import { enhancedImages } from "@sveltejs/enhanced-img";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import pkg from "./package.json" with { type: "json" };

function appVersion() {
	if (process.env.POSTPIN_VERSION) return process.env.POSTPIN_VERSION; // CI/CD pipeline sets this
	try {
		const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
		const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() ? "-dirty" : "";
		return `${pkg.version}+${sha}${dirty}`;
	} catch {
		return `${pkg.version}+${Date.now()}-unknown`; // no git available, fallback to timestamp
	}
}

export default defineConfig({
	plugins: [
		enhancedImages(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				experimental: { async: true },
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true },
			inspector: true,
			version: {
				name: appVersion(),
			},
		}),
	],
	server: {
		// POSTPIN_HOST=0.0.0.0 -> reachable from other devices in the network
		host: process.env.POSTPIN_HOST,
	},
});
