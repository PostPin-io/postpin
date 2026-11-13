#!/usr/bin/env node
// Checks a built ffmpeg against everything the PostPin plugins do with it.
//   node tools/ffmpeg/test/run.mjs <dir with ffmpeg + ffprobe> [--universal] [--signed]
// --universal: the macOS binaries must contain arm64 and x86_64. --signed: they must pass codesign.
// Runs on the target OS (Node 26 runs the shared TypeScript directly). Exits non-zero on any failure.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkHlsSize,
	displaySize,
	hlsArgs,
	parseHlsPlaylist,
	selectRenditions,
} from "../../../packages/shared/src/media/hls.ts";
import {
	parseSceneScores,
	sceneDetectArgs,
} from "../../../packages/shared/src/media/scene-detect.ts";
import { ffprobeArgs, parseProbe } from "../../../packages/shared/src/media/probe.ts";

const [binDir, ...flags] = process.argv.slice(2);
if (!binDir) {
	console.error("usage: run.mjs <dir with ffmpeg + ffprobe> [--universal] [--signed]");
	process.exit(2);
}
const exe = process.platform === "win32" ? ".exe" : "";
const FFMPEG = path.resolve(binDir, `ffmpeg${exe}`);
const FFPROBE = path.resolve(binDir, `ffprobe${exe}`);
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), "postpin-ffmpeg-test-"));

let failures = 0;
/** Runs one check, prints it and counts failures; a check throws to fail */
function check(name, fn) {
	try {
		const note = fn();
		console.log(`ok    ${name}${note ? ` (${note})` : ""}`);
	} catch (error) {
		failures++;
		console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
	}
}
function warn(name, fn) {
	try {
		fn();
		console.log(`ok    ${name}`);
	} catch (error) {
		console.log(`warn  ${name}: ${error instanceof Error ? error.message : error}`);
	}
}
function assert(condition, message) {
	if (!condition) throw new Error(message);
}

// FFMPEG_ARCH=x86_64 runs the Intel slice of a universal build under Rosetta (macOS only)
const ARCH = process.env.FFMPEG_ARCH;
const ownBinaries = new Set([FFMPEG, FFPROBE]);

/** Runs a binary and returns stdout; throws with stderr when it fails */
function run(bin, args) {
	const [cmd, cmdArgs] =
		ARCH && process.platform === "darwin" && ownBinaries.has(bin)
			? ["arch", [`-${ARCH}`, bin, ...args]]
			: [bin, args];
	const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	if (res.error) throw res.error;
	if (res.status !== 0) {
		// ffmpeg names the cause first (e.g. "Decoder (codec cfhd) not found") and ends with a generic line
		const cause = res.stderr.trim().split("\n")[0];
		throw new Error(`${path.basename(bin)} exited with ${res.status}: ${cause}`);
	}
	return { stdout: res.stdout, stderr: res.stderr };
}
const probe = (file) =>
	JSON.parse(run(FFPROBE, ["-v", "error", "-show_streams", "-of", "json", file]).stdout);

// ─── the build itself ───────────────────────────────────────────────────────

check("buildconf: GPL with x264, no network", () => {
	const conf = run(FFMPEG, ["-hide_banner", "-buildconf"]).stdout;
	for (const flag of [
		"--enable-gpl",
		"--enable-libx264",
		"--disable-network",
		"--disable-everything",
	]) {
		assert(conf.includes(flag), `${flag} missing`);
	}
});

if (process.platform === "darwin") {
	for (const bin of [FFMPEG, FFPROBE]) {
		check(`${path.basename(bin)}: only system libraries`, () => {
			// a universal binary lists its libraries once per architecture, each under a
			// "<path> (architecture …):" header; the libraries are the indented lines
			const libs = run("otool", ["-L", bin])
				.stdout.split("\n")
				.filter((line) => /^\s/.test(line))
				.map((line) => line.trim().split(" ")[0])
				.filter(Boolean);
			const foreign = libs.filter(
				(l) => !l.startsWith("/usr/lib/") && !l.startsWith("/System/Library/"),
			);
			assert(foreign.length === 0, `links ${foreign.join(", ")}`);
		});
		if (flags.includes("--universal")) {
			check(`${path.basename(bin)}: universal`, () => {
				const archs = run("lipo", ["-archs", bin]).stdout.trim().split(" ").sort();
				assert(archs.join(" ") === "arm64 x86_64", `architectures: ${archs.join(" ")}`);
			});
		}
		if (flags.includes("--signed")) {
			check(`${path.basename(bin)}: signed`, () => {
				run("codesign", ["--verify", "--strict", "--verbose=2", bin]);
				const info = spawnSync("codesign", ["-dv", bin], { encoding: "utf8" }).stderr;
				assert(info.includes("flags=0x10000(runtime)"), "no hardened runtime");
			});
		}
	}
}

// ─── every codec a plugin may get from an NLE ───────────────────────────────

if (ARCH) console.log(`running ffmpeg as ${ARCH}`);

// fixture names are the codec ffprobe has to report; these two serve other checks
const special = new Set(["rotated.mp4", "cuts.mp4"]);
for (const file of readdirSync(FIXTURES).filter((f) => !special.has(f) && !f.startsWith("."))) {
	const codec = file.replace(/\.[^.]+$/, "");
	check(`decodes ${codec}`, () => {
		const input = path.join(FIXTURES, file);
		const { stderr } = run(FFMPEG, ["-v", "error", "-nostdin", "-i", input, "-f", "null", "-"]);
		assert(stderr.trim() === "", stderr.trim().split("\n")[0]);
		const names = probe(input).streams.map((s) => s.codec_name);
		assert(names.includes(codec), `ffprobe reports ${names.join(", ")}`);
	});
}

// ─── review proxies: what renderAndUpload does ──────────────────────────────

check("proxies: 4K source, all renditions, byte ranges and levels", () => {
	// a short 4K source with sound, made by the ffmpeg under test (it has no lavfi input)
	const source = path.join(tmp, "source-2160.mp4");
	run(FFMPEG, [
		"-v",
		"error",
		"-nostdin",
		"-y",
		"-i",
		path.join(FIXTURES, "h264.mp4"),
		"-i",
		path.join(FIXTURES, "aac.m4a"),
		"-map",
		"0:v",
		"-map",
		"1:a",
		"-vf",
		"scale=3840:2160",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-c:a",
		"aac",
		"-shortest",
		source,
	]);
	const stream = probe(source).streams.find((s) => s.codec_type === "video");
	const renditions = selectRenditions(displaySize(stream));
	assert(renditions.length === 4, `${renditions.length} renditions for 4K`);
	const outputs = renditions.map((r) => ({
		media: path.join(tmp, `${r.height}.mp4`),
		playlist: path.join(tmp, `${r.height}.m3u8`),
	}));
	run(FFMPEG, [
		"-v",
		"error",
		"-y",
		...hlsArgs({ input: source, renditions, outputs, hasAudio: true }),
	]);
	const levels = outputs.map(({ media, playlist }) => {
		checkHlsSize(parseHlsPlaylist(readFileSync(playlist, "utf8")), statSync(media).size);
		const streams = probe(media).streams;
		assert(
			streams.some((s) => s.codec_name === "aac"),
			`${path.basename(media)} has no AAC`,
		);
		return streams.find((s) => s.codec_type === "video").level;
	});
	assert(levels.join() === "52,42,42,42", `levels ${levels.join(", ")}`);
	return renditions.map((r) => `${r.height}p`).join(", ");
});

check("proxies: rotation is read from the display matrix", () => {
	// parseProbe() is what the plugins use
	const media = parseProbe(run(FFPROBE, ffprobeArgs(path.join(FIXTURES, "rotated.mp4"))).stdout);
	assert(media.rotation !== null && Math.abs(media.rotation) === 90, `rotation ${media.rotation}`);
	const size = displaySize(media);
	assert(
		size.width === media.height && size.height === media.width,
		`display size ${size.width}x${size.height}`,
	);
});

// ─── scene detection, for web uploads and later in the plugins ──────────────

check("scene detection: finds the cut at 2 s", () => {
	const { stdout } = run(FFMPEG, [
		"-v",
		"error",
		...sceneDetectArgs(path.join(FIXTURES, "cuts.mp4")),
	]);
	const scores = parseSceneScores(stdout, {
		fpsNumerator: 25,
		fpsDenominator: 1,
		dropFrame: false,
	});
	assert(
		scores.some(([frame]) => Math.abs(frame - 50) <= 1),
		`scores ${JSON.stringify(scores)}`,
	);
});

// ─── hardware, where the machine has it ─────────────────────────────────────

if (process.platform === "darwin") {
	// CI runners may have no media engine: a warning, not a failure
	warn("VideoToolbox: H.264 encode and hardware decode", () => {
		const out = path.join(tmp, "vt.mp4");
		run(FFMPEG, [
			"-v",
			"error",
			"-y",
			"-i",
			path.join(FIXTURES, "h264.mp4"),
			"-c:v",
			"h264_videotoolbox",
			out,
		]);
		run(FFMPEG, ["-v", "error", "-hwaccel", "videotoolbox", "-i", out, "-f", "null", "-"]);
	});
}

rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
