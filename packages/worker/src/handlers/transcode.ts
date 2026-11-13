import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { encodeHls } from "../lib/hls.ts";
import { getOriginalUrl, s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3ObjectPath } from "@postpin-io/shared/storage";
import { prisma } from "../lib/database.ts";

/** Encodes all renditions of a media in one ffmpeg run, which decodes the original only once */
export async function transcode(job: TypedJob<typeof Queues.heavy, "transcode">) {
	const { mediaId, renditions, audio } = job.data;
	if (renditions.length === 0) throw new Error("transcode needs at least one rendition");

	const proxies = await prisma.$transaction(
		renditions.map((rendition) =>
			prisma.mediaFile.upsert({
				where: {
					proxyOfId_width_height_bitrate: {
						proxyOfId: mediaId,
						width: rendition.width,
						height: rendition.height,
						bitrate: rendition.bitRate,
					},
				},
				update: {
					status: "PROCESSING",
				},
				create: {
					proxyOfId: mediaId,
					contentType: "video/mp4",
					bitrate: rendition.bitRate,
					videoCodec: rendition.codec,
					width: rendition.width,
					height: rendition.height,
					audioCodec: audio.codec,
					status: "PROCESSING",
				},
			}),
		),
	);
	const presignedSourceUrl = await getOriginalUrl(mediaId);
	// ffmpeg reports progress several times a second; only forward it to Redis once a second
	let lastProgressUpdate = 0;
	const results = await encodeHls(
		presignedSourceUrl,
		renditions.map((rendition) => ({
			width: rendition.width,
			height: rendition.height,
			videoBitRate: rendition.bitRate,
			audioBitRate: audio.bitRate,
		})),
		// lib-storage aborts the multipart upload itself when the body stream errors
		(index, body) =>
			new Upload({
				client: s3Client,
				params: {
					Bucket: env.S3_BUCKET,
					Key: getS3ObjectPath({ mediaId, type: "proxy", proxyId: proxies[index]!.id }),
					Body: body,
					ContentType: "video/mp4",
				},
			}).done(),
		(progress) => {
			const now = Date.now();
			if (now - lastProgressUpdate < 1000) return;
			lastProgressUpdate = now;
			job.updateProgress(progress).catch(console.error);
		},
	);
	await prisma.$transaction(
		results.map((result, i) =>
			prisma.mediaFile.update({
				where: {
					id: proxies[i]!.id,
				},
				data: {
					status: "COMPLETED",
					hls: result.hls,
					codecs: result.codecs,
					size: BigInt(result.bytes),
					duration: result.hls.segments.reduce((sum, segment) => sum + segment.duration, 0),
					audioCodec: result.hasAudio ? audio.codec : null,
				},
			}),
		),
	);
	await job.updateProgress(1);
	// parent jobs (seek sprites, barcode) work off the smallest proxy, it's the quickest to read
	const smallest = renditions.reduce(
		(min, rendition, i) => (rendition.height < renditions[min]!.height ? i : min),
		0,
	);
	return { proxyId: proxies[smallest]!.id };
}
