import { isMac, sep, uxp } from "../host";
import type { ProcessAddon } from "../native";

export interface FfmpegPaths {
	ffmpeg: string;
	ffprobe: string;
}

/**
 * The ffmpeg and ffprobe bundled in the plugin's bin/mac or bin/win (tools/ffmpeg/fetch.mjs puts
 * them there). Throws when they're missing; makes them executable on macOS.
 */
export async function findFfmpeg(addon: ProcessAddon): Promise<FfmpegPaths> {
	const folder = (await uxp.storage.localFileSystem.getPluginFolder()).nativePath.replace(
		/[\\/]$/,
		"",
	);
	const dir = [folder, "bin", isMac ? "mac" : "win"].join(sep);
	const exe = isMac ? "" : ".exe";
	const paths = { ffmpeg: `${dir}${sep}ffmpeg${exe}`, ffprobe: `${dir}${sep}ffprobe${exe}` };
	// throws for a missing file, so the caller knows there's no ffmpeg
	addon.ensureExecutable(paths.ffmpeg);
	addon.ensureExecutable(paths.ffprobe);
	return paths;
}
