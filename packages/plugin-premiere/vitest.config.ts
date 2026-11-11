import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "plugin-premiere:unit",
		include: ["tests/**/*.test.ts"],
	},
});
