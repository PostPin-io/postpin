import esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");
const install = process.argv.includes("--install");
const PLUGIN_DIR =
	"/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/io.postpin.plugin.resolve";

// Resolve's native module differs per platform: darwin (universal), win32-x64 or win32-arm64
const target =
	process.argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ??
	(process.platform === "darwin" ? "darwin" : `${process.platform}-${process.arch}`);
const nativeModule = {
	name: "native-module",
	setup(build) {
		build.onResolve({ filter: /WorkflowIntegration\.node$/ }, () => ({
			path: path.resolve("native", target, "WorkflowIntegration.node"),
		}));
	},
};

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
// Resolve shows this version; keep it numeric (0.2.0-rc.1 -> 0.2.0)
const manifest = await fs.readFile("manifest.xml", "utf8");
await fs.writeFile(
	"dist/manifest.xml",
	manifest.replace(/<Version>.*<\/Version>/, `<Version>${version.split("-")[0]}</Version>`),
);
await fs.cp("node_modules/@postpin-io/plugin-electron/assets/icon.png", "dist/icon.png");
await fs.writeFile(
	"dist/package.json",
	JSON.stringify({ name: "postpin-resolve", version, main: "main.js" }, null, 2),
);

// macOS: universal; Windows targets get the Windows build
const ffmpegPlatform = target.startsWith("win32") ? "windows-x64" : "macos-universal";
try {
	execFileSync("node", ["../../tools/ffmpeg/fetch.mjs", ffmpegPlatform, "dist/bin"], {
		stdio: "inherit",
	});
} catch (error) {
	// a release must ship ffmpeg; while developing, the server encodes without it (or set FFMPEG_DIR)
	if (!dev) throw error;
	console.warn("No ffmpeg in dist/bin, the server encodes. Set FFMPEG_DIR to use a local one.");
}

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
		plugins: [nativeModule],
		loader: {
			".node": "copy",
		},
		assetNames: "[name]",
		format: "cjs",
		define: {
			DEV_SERVER_URL: JSON.stringify(dev ? "http://localhost:5183" : ""),
			DEFAULT_SERVER_URL: JSON.stringify(dev ? "http://localhost:5173" : "https://postpin.io"),
		},
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
		const ctx = await esbuild.context({
			...options,
			plugins: [...(options.plugins ?? []), logRebuilds(options.outfile)],
		});
		await ctx.watch();
	}
} else {
	for (const options of builds) await esbuild.build(options);
	if (install) await installDist();
}

if (watch) console.log("Watching src/electron. Reopen the plugin in Resolve to load changes.");
