import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			name: "postpin:unit",
			include: ["tests/unit/**/*.test.ts"],
			coverage: {
				provider: "v8",
				include: ["src/**"],
				exclude: ["src/api/build/**"],
				reporter: ["text-summary", "html"],
			},
		},
	}),
);
