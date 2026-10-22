import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import * as v from "valibot";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";

export async function movieBarcode(job: TypedJob<typeof Queues.light, "movieBarcode">) {
	const { mediaId } = job.data;

	// seekSprites is this job's child and passes on the 480p proxy its transcode child wrote
	const [child] = Object.values(await job.getChildrenValues()) as { proxyId: string }[];
	if (!child) throw new Error("movieBarcode needs its seekSprites child");
	const proxy = await prisma.mediaFile.findUniqueOrThrow({ where: { id: child.proxyId } });
	const hls = v.parse(hlsInfo, proxy.hls);

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
		`scale=1:1:flags=area`,
		"-fps_mode",
		"passthrough",
		"-pix_fmt",
		"rgb24",
		"-f",
		"rawvideo",
		"pipe:1",
	]);
	const ffmpegResult = proc.done.then(
		() => null,
		(error: unknown) => error,
	);
	const chunks: Buffer[] = [];
	for await (const chunk of proc.stdout) chunks.push(chunk as Buffer);
	const error = await ffmpegResult;
	if (error) throw error;

	// rgb24 at 1x1: 3 bytes per keyframe, one keyframe per segment
	const rgb = Buffer.concat(chunks);
	const count = hls.segments.length;
	if (rgb.length !== count * 3) {
		throw new Error(`Expected ${count} barcode colors, ffmpeg wrote ${rgb.length / 3}`);
	}

	await prisma.media.update({
		where: { id: mediaId },
		data: {
			movieBarcode: {
				interval: hls.segments[0]!.duration,
				count,
				colors: rgb.toString("base64"),
			} satisfies MovieBarcode,
		},
	});

	return { proxyId: proxy.id };
}
