#!/usr/bin/env node
// Puts the pinned ffmpeg + ffprobe for a platform into a directory, for the plugin builds.
//   node tools/ffmpeg/fetch.mjs <macos-universal|windows-x64|host> <dest dir>
// "host" is the platform this runs on; "{os}" in <dest dir> becomes mac or win (electron-builder's
// ${os}), e.g. `fetch.mjs host bin/{os}`.
// Downloads the release asset from versions.json once (cached), checks its SHA-256 and unpacks
// ffmpeg, ffprobe, LICENSE.md and BUILDCONF.txt into <dest dir>.
// FFMPEG_DIR=<dir> copies ffmpeg + ffprobe from there instead, e.g. /opt/homebrew/bin while developing
// or tools/ffmpeg/out/<platform> after a local build.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// FFMPEG_RELEASES_URL: a mirror with the same layout (<url>/<tag>/<file>)
const RELEASES =
	process.env.FFMPEG_RELEASES_URL ?? "https://github.com/PostPin-io/postpin/releases/download";

const HOST = { darwin: "macos-universal", win32: "windows-x64" };
const [platformArg, destArg] = process.argv.slice(2);
const platform = platformArg === "host" ? HOST[process.platform] : platformArg;
const versions = JSON.parse(readFileSync(path.join(HERE, "versions.json"), "utf8"));
const asset = versions.release.assets[platform];
if (!asset || !destArg) {
	const names = [...Object.keys(versions.release.assets), "host"].join("|");
	console.error(
		platformArg === "host"
			? `fetch.mjs: no ffmpeg build for ${process.platform}`
			: `usage: fetch.mjs <${names}> <dest dir>`,
	);
	process.exit(2);
}
const dest = path.resolve(
	destArg.replaceAll("{os}", platform.startsWith("windows") ? "win" : "mac"),
);
const exe = platform.startsWith("windows") ? ".exe" : "";
const binaries = [`ffmpeg${exe}`, `ffprobe${exe}`];

function fail(message) {
	console.error(`fetch.mjs: ${message}`);
	process.exit(1);
}

function cacheDir() {
	const base =
		process.env.XDG_CACHE_HOME ??
		(process.platform === "win32" ? process.env.LOCALAPPDATA : undefined) ??
		path.join(homedir(), ".cache");
	return path.join(base, "postpin-ffmpeg");
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The release asset in the cache, downloaded and verified */
async function cachedAsset() {
	if (!/^[0-9a-f]{64}$/.test(asset.sha256)) {
		fail(
			`versions.json has no checksum for ${asset.file} yet (release ${versions.release.tag}). ` +
				"Set FFMPEG_DIR to a local ffmpeg, or fill in the release's SHA256SUMS.",
		);
	}
	const file = path.join(cacheDir(), asset.file);
	if (existsSync(file) && sha256(file) === asset.sha256) return file;

	const url = `${RELEASES}/${versions.release.tag}/${asset.file}`;
	console.log(`fetch.mjs: downloading ${url}`);
	const res = await fetch(url);
	if (!res.ok) fail(`${url}: HTTP ${res.status}`);
	const body = Buffer.from(await res.arrayBuffer());
	const actual = createHash("sha256").update(body).digest("hex");
	// never fall back to anything else: a mismatch means a changed or broken release
	if (actual !== asset.sha256)
		fail(`${asset.file}: SHA-256 is ${actual}, expected ${asset.sha256}`);
	mkdirSync(cacheDir(), { recursive: true });
	writeFileSync(file, body);
	return file;
}

/** Unpacks .tar.xz and .zip; bsdtar (macOS, Windows 10+) reads both, GNU tar on Linux no zip */
function unpack(archive, into) {
	const zipOnLinux = archive.endsWith(".zip") && process.platform === "linux";
	const [cmd, args] = zipOnLinux
		? ["unzip", ["-q", archive, "-d", into]]
		: ["tar", ["-xf", archive, "-C", into]];
	const res = spawnSync(cmd, args, { stdio: "inherit" });
	if (res.status !== 0) fail(`unpacking ${archive} with ${cmd} failed`);
}

mkdirSync(dest, { recursive: true });
const localDir = process.env.FFMPEG_DIR;
if (localDir) {
	for (const bin of binaries) {
		const from = path.join(localDir, bin);
		if (!existsSync(from)) fail(`FFMPEG_DIR has no ${bin}: ${from}`);
		copyFileSync(from, path.join(dest, bin));
	}
	copyFileSync(path.join(HERE, "LICENSE.md"), path.join(dest, "LICENSE.md"));
	const buildconf = path.join(localDir, "BUILDCONF.txt");
	if (existsSync(buildconf)) copyFileSync(buildconf, path.join(dest, "BUILDCONF.txt"));
	console.log(`fetch.mjs: copied ffmpeg from ${localDir} (not the pinned release)`);
} else {
	const archive = await cachedAsset();
	const unpacked = mkdtempSync(path.join(tmpdir(), "postpin-ffmpeg-"));
	try {
		unpack(archive, unpacked);
		for (const file of [...binaries, "LICENSE.md", "BUILDCONF.txt"]) {
			const from = path.join(unpacked, file);
			if (!existsSync(from)) fail(`${asset.file} has no ${file}`);
			copyFileSync(from, path.join(dest, file));
		}
	} finally {
		rmSync(unpacked, { recursive: true, force: true });
	}
	console.log(`fetch.mjs: ${versions.release.tag} ${platform} → ${dest}`);
}

if (!exe) {
	for (const bin of binaries) {
		chmodSync(path.join(dest, bin), 0o755);
		// downloads get quarantined; the release binaries are notarized, but local builds aren't
		if (process.platform === "darwin") {
			spawnSync("xattr", ["-d", "com.apple.quarantine", path.join(dest, bin)], { stdio: "ignore" });
		}
	}
}
