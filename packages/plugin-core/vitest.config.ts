import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "plugin-core:unit",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			exclude: ["src/**/*.svelte", "src/**/*.d.ts"],
			reporter: ["text-summary", "html"],
		},
	},
});
