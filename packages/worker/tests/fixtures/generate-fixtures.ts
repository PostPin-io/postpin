// Vitest global setup: renders three-cuts.mp4 with ffmpeg instead of committing the binary.
// Without ffmpeg it is skipped; the tests that need the video check for ffmpeg themselves.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("./three-cuts.mp4", import.meta.url));

export default function setup() {
	if (existsSync(target) || spawnSync("ffmpeg", ["-version"]).status !== 0) return;
	// 8 s at 24 fps, alternating black and white for 2 s each (scene score 1 at every cut): hard cuts at 2 s, 4 s and 6 s and no change in between
	const colors = ["black", "white", "black", "white"];
	const tmp = target.replace(/three-cuts/, ".tmp-three-cuts");
	execFileSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...colors.flatMap((c) => ["-f", "lavfi", "-i", `color=c=${c}:s=320x180:r=24:d=2`]),
			"-filter_complex",
			`${colors.map((_, i) => `[${i}]`).join("")}concat=n=${colors.length}:v=1:a=0,format=yuv420p`,
			"-c:v",
			"libx264",
			tmp,
		],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
	renameSync(tmp, target);
}
