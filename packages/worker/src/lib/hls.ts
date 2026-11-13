import fs from "fs/promises";
import os from "os";
import path from "path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HlsInfo } from "@postpin-io/shared/types/HlsIndex";
import {
	checkHlsSize,
	hlsArgs,
	parseHlsPlaylist,
	proxyCodecs,
	type Rendition,
} from "@postpin-io/shared/media/hls";
import { ffmpeg } from "./ffmpeg.ts";

export interface HlsResult {
	hls: HlsInfo;
	/** total size of the media file in bytes */
	bytes: number;
	/** RFC 6381 codecs for the master playlist */
	codecs: string;
	hasAudio: boolean;
}

export interface EncodeHlsOptions {
	input: string;
	renditions: readonly Rendition[];
	hasAudio: boolean;
	audioBitRate?: number;
}

/**
 * Encodes `input` with hlsArgs() into one fragmented MP4 per rendition. Each media file goes to
 * `sink` as a stream, only ffmpeg's playlists (a few KB each) touch the disk.
 * Results come back in the order of `renditions`.
 */
export async function encodeHls(
	{ input, renditions, hasAudio, audioBitRate }: EncodeHlsOptions,
	sink: (index: number, body: Readable) => Promise<unknown>,
	onProgress?: (fraction: number) => void,
): Promise<HlsResult[]> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hls-"));
	const playlistPath = (i: number) => path.join(dir, `${i}.m3u8`);
	try {
		const args = hlsArgs({
			input,
			renditions,
			hasAudio,
			audioBitRate,
			// fd 3, 4, ...: ffmpeg() opens one extra pipe per output
			outputs: renditions.map((_, i) => ({ media: `pipe:${3 + i}`, playlist: playlistPath(i) })),
		});
		const proc = ffmpeg(args, onProgress, renditions.length);

		const bytes = renditions.map(() => 0);
		// all sinks run at once: ffmpeg blocks as soon as any one pipe is full
		const uploads = proc.outputs.map((output, i) => {
			const counter = new Transform({
				transform(chunk: Buffer, _encoding, callback) {
					bytes[i]! += chunk.length;
					callback(null, chunk);
				},
			});
			// a failed ffmpeg must fail the sinks too, so no partial file gets stored as complete
			proc.done.catch((error: Error) => counter.destroy(error));
			return Promise.all([
				pipeline(output, counter),
				// a failed sink closes its pipe, so ffmpeg ends instead of blocking on it forever
				sink(i, counter).catch((error: Error) => {
					counter.destroy(error);
					throw error;
				}),
			]);
		});
		await Promise.all([...uploads, proc.done]);

		return await Promise.all(
			renditions.map(async (rendition, i) => {
				const hls = parseHlsPlaylist(await fs.readFile(playlistPath(i), "utf8"));
				try {
					checkHlsSize(hls, bytes[i]!);
				} catch (error) {
					throw new Error(`${rendition.height}p: ${(error as Error).message}`);
				}
				return { hls, bytes: bytes[i]!, codecs: proxyCodecs(hasAudio, rendition), hasAudio };
			}),
		);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}
