import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "worker:unit",
		include: ["tests/**/*.test.ts"],
		globalSetup: ["tests/fixtures/generate-fixtures.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			reporter: ["text-summary", "html"],
		},
	},
});
