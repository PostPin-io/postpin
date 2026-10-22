import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { getPresignedUrl, getS3ObjectPath } from "@postpin-io/shared/storage";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import type { SeekSprites } from "@postpin-io/shared/types/SeekSprites";
import * as v from "valibot";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { splitJPEGs } from "../lib/image.ts";
import { s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";

const TILE_WIDTH = 160;
const COLUMNS = 10;
const ROWS = 10;

/** Timeline hover previews: one tile per keyframe of the 480p proxy, 100 tiles per JPEG sheet */
export async function seekSprites(job: TypedJob<typeof Queues.light, "seekSprites">) {
	const { mediaId } = job.data;
	// the 480p transcode is this job's child and returns the proxy it wrote
	const [child] = Object.values(await job.getChildrenValues()) as { proxyId: string }[];
	if (!child) throw new Error("seekSprites needs its transcode child");
	const proxy = await prisma.mediaFile.findUniqueOrThrow({ where: { id: child.proxyId } });
	const hls = v.parse(hlsInfo, proxy.hls);

	// width/height are the rendition's 16:9 box; tiles keep that shape and letterbox other aspect ratios
	const tileHeight = Math.round((TILE_WIDTH * proxy.height!) / proxy.width! / 2) * 2;
	const proxyUrl = await getPresignedUrl(s3Client, env, {
		mediaId,
		type: "proxy",
		proxyId: proxy.id,
	});
	const proc = ffmpeg([
		"-nostdin",
		// keyframes only: the proxy has exactly one per 2s segment, so this decodes about 1 frame in 50
		"-skip_frame",
		"nokey",
		"-i",
		proxyUrl,
		"-vf",
		`scale=${TILE_WIDTH}:${tileHeight}:force_original_aspect_ratio=decrease,` +
			`pad=${TILE_WIDTH}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${COLUMNS}x${ROWS}`,
		"-fps_mode",
		"passthrough",
		"-c:v",
		"mjpeg",
		"-q:v",
		"5",
		"-f",
		"image2pipe",
		"pipe:1",
	]);
	// ffmpeg can fail while sheets are still uploading; catch it now so it isn't an unhandled rejection
	const ffmpegResult = proc.done.then(
		() => null,
		(error: unknown) => error,
	);

	let sheets = 0;
	// one sheet covers 200s, so even a feature has only a few dozen; uploading them in turn keeps it simple
	for await (const sheet of splitJPEGs(proc.stdout)) {
		await s3Client.putObject({
			Bucket: env.S3_BUCKET,
			Key: getS3ObjectPath({ mediaId, type: "sprite", index: sheets }),
			Body: sheet,
			ContentType: "image/jpeg",
		});
		sheets++;
	}
	const error = await ffmpegResult;
	if (error) throw error;

	const count = hls.segments.length;
	if (sheets !== Math.ceil(count / (COLUMNS * ROWS))) {
		throw new Error(`Expected sheets for ${count} keyframes, ffmpeg wrote ${sheets}`);
	}

	await prisma.media.update({
		where: { id: mediaId },
		data: {
			seekSprites: {
				// 2.002s at 23.976: tile i shows the keyframe at the start of segment i
				interval: hls.segments[0]!.duration,
				tileWidth: TILE_WIDTH,
				tileHeight,
				columns: COLUMNS,
				rows: ROWS,
				count,
				sheets,
			} satisfies SeekSprites,
		},
	});
}
