import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

/** Integration tests: real Postgres (postpin_test), one file at a time */
export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			name: "postpin:integration",
			include: ["tests/integration/**/*.test.ts"],
			globalSetup: ["tests/integration/global-setup.ts"],
			setupFiles: ["tests/integration/setup.ts"],
			// all files share one database, which is truncated before each test
			fileParallelism: false,
			coverage: {
				provider: "v8",
				include: ["src/**"],
				exclude: ["src/api/build/**"],
				reporter: ["text-summary", "html"],
			},
		},
	}),
);
