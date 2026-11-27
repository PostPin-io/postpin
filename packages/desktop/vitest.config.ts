import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "desktop:unit",
		include: ["tests/**/*.test.ts"],
	},
});
