// Vitest global setup: renders the small video fixtures in tests/fixtures/upload with ffmpeg instead of
// committing binaries. Files that already exist are kept, so only the first run pays for it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./upload/", import.meta.url));

/** One second of testsrc at 64x36 per file: [name, frame rate, encoder + muxer args] */
const fixtures: [string, string, string[]][] = [
	[
		"h264-23976-tc.mp4",
		"24000/1001",
		[
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-timecode",
			"01:00:00:00",
			"-movflags",
			"+faststart",
		],
	],
	["h264-25.mp4", "25", ["-c:v", "libx264", "-pix_fmt", "yuv420p"]],
	[
		"hevc-50-tc.mov",
		"50",
		[
			"-c:v",
			"libx265",
			"-pix_fmt",
			"yuv420p",
			"-x265-params",
			"log-level=error",
			"-tag:v",
			"hvc1",
			"-timecode",
			"10:00:00:00",
		],
	],
	[
		"prores-2997df-tc.mov",
		"30000/1001",
		["-c:v", "prores_ks", "-profile:v", "0", "-timecode", "00:59:58;00"],
	],
	["vp9-24.webm", "24", ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"]],
	[
		"mpeg2-25-tc.mxf",
		"25",
		["-c:v", "mpeg2video", "-pix_fmt", "yuv420p", "-timecode", "01:00:00:00"],
	],
];

export default function setup() {
	mkdirSync(dir, { recursive: true });
	for (const [name, rate, args] of fixtures) {
		const target = dir + name;
		if (existsSync(target)) continue;
		// write next to the target (same extension, so ffmpeg picks the muxer) and rename, so an aborted run never leaves a half-written fixture
		const tmp = `${dir}.tmp-${name}`;
		try {
			execFileSync(
				"ffmpeg",
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					"-f",
					"lavfi",
					"-i",
					`testsrc=size=64x36:rate=${rate}:duration=1`,
					...args,
					tmp,
				],
				{ stdio: ["ignore", "inherit", "inherit"] },
			);
		} catch (cause) {
			throw new Error(`Could not render the upload fixture ${name}. Is ffmpeg installed?`, {
				cause,
			});
		}
		renameSync(tmp, target);
	}
}
