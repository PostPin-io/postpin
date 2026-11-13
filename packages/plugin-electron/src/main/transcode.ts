import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	checkHlsSize,
	hlsArgs,
	parseHlsPlaylist,
	type Rendition,
} from "@postpin-io/shared/media/hls";
import {
	ffprobeArgs,
	parseProbe,
	PROGRESS_ARGS,
	progressReader,
} from "@postpin-io/shared/media/probe";
import type { EncodedProxy } from "@postpin-io/plugin-core/bridge";
import type { FfmpegPaths } from "./ffmpeg";

// running ffmpegs, killed when the window closes; and the files removeFile() may delete
const running = new Set<ChildProcess>();
const produced = new Set<string>();

/** Runs a binary to the end; resolves stdout, rejects with ffmpeg's first error line */
function run(bin: string, args: string[], onStdout?: (chunk: string) => void) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
		running.add(child);
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk;
			onStdout?.(chunk);
		});
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
		child.on("error", (error) => {
			running.delete(child);
			reject(error);
		});
		child.on("close", (code, signal) => {
			running.delete(child);
			if (code === 0) resolve(stdout);
			else
				reject(
					new Error(
						`${path.basename(bin)} failed (${signal ?? code}): ${stderr.trim().split("\n")[0]}`,
					),
				);
		});
	});
}

export async function probe(paths: FfmpegPaths, input: string) {
	return parseProbe(await run(paths.ffprobe, ffprobeArgs(input)));
}

export async function transcode(
	paths: FfmpegPaths,
	input: string,
	renditions: Rendition[],
	hasAudio: boolean,
	onProgress: (fraction: number) => void,
): Promise<EncodedProxy[]> {
	const { duration } = await probe(paths, input);
	const dir = await mkdtemp(path.join(os.tmpdir(), "postpin-"));
	const outputs = renditions.map((r) => ({
		media: path.join(dir, `${r.height}p.mp4`),
		playlist: path.join(dir, `${r.height}p.m3u8`),
	}));
	try {
		await run(
			paths.ffmpeg,
			hlsArgs({ input, renditions, outputs, hasAudio, globalArgs: PROGRESS_ARGS }),
			progressReader(duration, onProgress),
		);
		const results = await Promise.all(
			outputs.map(async ({ media, playlist }) => {
				const hls = parseHlsPlaylist(await readFile(playlist, "utf8"));
				const { size } = await stat(media);
				checkHlsSize(hls, size);
				return { path: media, hls, bytes: size };
			}),
		);
		// only the media files leave the main process; the playlists are read
		await Promise.all(outputs.map(({ playlist }) => rm(playlist, { force: true })));
		for (const { path: file } of results) produced.add(file);
		return results;
	} catch (error) {
		await rm(dir, { recursive: true, force: true });
		throw error;
	}
}

/** Deletes a file transcode() wrote, and its folder once empty; nothing else */
export async function removeFile(file: string) {
	if (!produced.delete(file)) throw new Error("removeFile only deletes files transcode() wrote");
	await rm(file, { force: true });
	await rmdir(path.dirname(file)).catch(() => {}); // not empty yet
}

export function killAll() {
	for (const child of running) child.kill("SIGKILL");
}
