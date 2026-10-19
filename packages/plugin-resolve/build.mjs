import esbuild from "esbuild";
import fs from "node:fs/promises";

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");
const install = process.argv.includes("--install");
const PLUGIN_DIR =
	"/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.postpin.resolve";

if (install) {
	try {
		await fs.access(PLUGIN_DIR, fs.constants.W_OK);
	} catch {
		console.error(`${PLUGIN_DIR} isn't writable. Run \`pnpm setup:mac\` once.`);
		process.exit(1);
	}
}

await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist");
await fs.cp("manifest.xml", "dist/manifest.xml");
await fs.writeFile(
	"dist/package.json",
	JSON.stringify({ name: "postpin-resolve", version: "1.0.0", main: "main.js" }, null, 2),
);

let installing = Promise.resolve();
const installDist = () =>
	(installing = installing.then(() => fs.cp("dist", PLUGIN_DIR, { recursive: true })));

const logRebuilds = (name) => ({
	name: "log-rebuilds",
	setup(build) {
		build.onEnd(async (result) => {
			let status = result.errors.length ? `failed with ${result.errors.length} error(s)` : "ok";
			if (install && !result.errors.length) {
				try {
					await installDist();
					status += ", installed";
				} catch (error) {
					status += `, install failed: ${error.message}`;
					installing = Promise.resolve();
				}
			}
			console.log(`[${new Date().toLocaleTimeString()}] ${name} ${status}`);
		});
	},
});

const builds = [
	{
		entryPoints: ["src/electron/main.ts"],
		bundle: true,
		platform: "node",
		outfile: "dist/main.js",
		external: ["electron"],
		minify: true,
		sourcemap: true,
		loader: {
			".node": "copy",
		},
		assetNames: "[name]",
		format: "cjs",
		define: { DEV_SERVER_URL: JSON.stringify(dev ? "http://localhost:5183" : "") },
	},
	{
		entryPoints: ["src/electron/preload.ts"],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: "dist/preload.js",
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
	if (install) await installDist();
}

if (watch) console.log("Watching src/electron. Reopen the plugin in Resolve to load changes.");
