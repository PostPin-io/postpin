import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "shared:unit",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			exclude: ["src/db/prisma/**"],
			reporter: ["text-summary", "html"],
		},
	},
});
