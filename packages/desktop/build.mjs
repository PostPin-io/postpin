import esbuild from "esbuild";
import fs from "node:fs/promises";

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist");

const logRebuilds = (name) => ({
	name: "log-rebuilds",
	setup(build) {
		build.onEnd(async (result) => {
			let status = result.errors.length ? `failed with ${result.errors.length} error(s)` : "ok";
			console.log(`[${new Date().toLocaleTimeString()}] ${name} ${status}`);
		});
	},
});

const builds = [
	{
		entryPoints: ["src/electron/main.ts"],
		bundle: true,
		platform: "node",
		outfile: "dist/main.cjs",
		external: ["electron"],
		minify: true,
		sourcemap: true,
		format: "cjs",
		logOverride: { "duplicate-case": "silent" },
		define: {
			DEV_SERVER_URL: JSON.stringify(dev ? "http://localhost:5184" : ""),
			DEFAULT_SERVER_URL: JSON.stringify(dev ? "http://localhost:5173" : "https://postpin.io"),
		},
	},
	{
		entryPoints: ["src/electron/preload.ts"],
		bundle: true,
		platform: "node",
		outfile: "dist/preload.cjs",
		format: "cjs",
		external: ["electron"],
		minify: true,
	},
];

if (watch) {
	for (const options of builds) {
		const ctx = await esbuild.context({ ...options, plugins: [logRebuilds(options.outfile)] });
		await ctx.watch();
	}
} else {
	for (const options of builds) await esbuild.build(options);
}

if (watch) console.log("Watching src/electron, the app restarts on changes.");
