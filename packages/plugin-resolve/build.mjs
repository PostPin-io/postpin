import esbuild from "esbuild";
import fs from "node:fs/promises";

const dev = process.argv.includes("--dev");

await fs.rm("dist", { recursive: true, force: true });

await esbuild.build({
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
});

await esbuild.build({
	entryPoints: ["src/electron/preload.ts"],
	bundle: true,
	platform: "node",
	target: "node18",
	outfile: "dist/preload.js",
	format: "cjs",
	external: ["electron"],
	minify: true,
});

await fs.cp("manifest.xml", "dist/manifest.xml");
await fs.writeFile(
	"dist/package.json",
	JSON.stringify({ name: "postpin-resolve", version: "1.0.0", main: "main.js" }, null, 2),
);
