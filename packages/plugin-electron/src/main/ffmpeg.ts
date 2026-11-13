import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";

export interface FfmpegPaths {
	ffmpeg: string;
	ffprobe: string;
}

/**
 * The bundled binaries in `dir`; FFMPEG_DIR overrides it while developing. Throws when they're
 * missing or not executable, so the caller falls back to the server encoding.
 */
export function findFfmpeg(dir: string): FfmpegPaths {
	const base = process.env.FFMPEG_DIR ?? dir;
	const exe = process.platform === "win32" ? ".exe" : "";
	const paths = {
		ffmpeg: path.join(base, `ffmpeg${exe}`),
		ffprobe: path.join(base, `ffprobe${exe}`),
	};
	for (const file of Object.values(paths)) {
		if (!existsSync(file)) throw new Error(`ffmpeg is missing: ${file}`);
		accessSync(file, constants.X_OK);
	}
	return paths;
}
