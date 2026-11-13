// Encodes the review proxies in Premiere: the same as plugin-electron/src/main/transcode.ts, with the
// native addon instead of child_process and UXP's file system instead of node:fs.
import type { EncodedProxy, HostBridge } from "@postpin-io/plugin-core/bridge";
import { checkHlsSize, hlsArgs, parseHlsPlaylist } from "@postpin-io/shared/media/hls";
import {
	ffprobeArgs,
	parseProbe,
	PROGRESS_ARGS,
	progressReader,
} from "@postpin-io/shared/media/probe";
import { fs, sep, uxp } from "../host";
import { loadAddon, runProcess, type ProcessAddon } from "../native";
import { findFfmpeg, type FfmpegPaths } from "./ffmpeg";

export type TranscodeBridge = Required<Pick<HostBridge, "probe" | "transcode" | "removeFile">>;

/** The files transcode() wrote: removeFile deletes only these */
const produced = new Set<string>();

async function removeQuietly(path: string) {
	try {
		await fs.unlink(path);
	} catch {
		// already gone
	}
}

export function createTranscodeBridge(addon: ProcessAddon, paths: FfmpegPaths): TranscodeBridge {
	const probe = async (file: string) =>
		parseProbe((await runProcess(addon, paths.ffprobe, ffprobeArgs(file))).stdout);

	return {
		probe,
		transcode: async (input, renditions, hasAudio, onProgress) => {
			const { duration } = await probe(input);
			const temp = (await uxp.storage.localFileSystem.getTemporaryFolder()).nativePath.replace(
				/[\\/]$/,
				"",
			);
			const run = `${temp}${sep}postpin-${Date.now()}`;
			const outputs = renditions.map((r) => ({
				media: `${run}-${r.height}p.mp4`,
				playlist: `${run}-${r.height}p.m3u8`,
			}));
			try {
				await runProcess(
					addon,
					paths.ffmpeg,
					hlsArgs({ input, renditions, outputs, hasAudio, globalArgs: PROGRESS_ARGS }),
					{ onStdout: progressReader(duration, onProgress) },
				);
				// also catches an exit code the host swallowed: every byte range must match its file
				const results: EncodedProxy[] = [];
				for (const { media, playlist } of outputs) {
					const hls = parseHlsPlaylist(await fs.readFile(playlist, { encoding: "utf-8" }));
					const { size } = await fs.lstat(media);
					checkHlsSize(hls, size);
					results.push({ path: media, hls, bytes: size });
				}
				for (const { path } of results) produced.add(path);
				return results;
			} catch (error) {
				await Promise.all(outputs.map(({ media }) => removeQuietly(media)));
				throw error;
			} finally {
				await Promise.all(outputs.map(({ playlist }) => removeQuietly(playlist)));
			}
		},
		removeFile: async (file) => {
			if (!produced.delete(file))
				throw new Error("removeFile only deletes files transcode() wrote");
			await removeQuietly(file);
		},
	};
}

/** The transcode bridge when the addon loads and ffmpeg is bundled, else null (the server encodes) */
export async function loadTranscodeBridge(): Promise<TranscodeBridge | null> {
	const addon = await loadAddon();
	if (!addon) return null;
	try {
		return createTranscodeBridge(addon, await findFfmpeg(addon));
	} catch (error) {
		console.warn("[PostPin] no bundled ffmpeg, the server encodes:", error);
		return null;
	}
}
