import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { encodeHls } from "../lib/hls.ts";
import { getOriginalUrl, s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3ObjectPath } from "@postpin-io/shared/storage";
import { prisma } from "../lib/database.ts";

export async function transcode(job: TypedJob<typeof Queues.heavy, "transcode">) {
	const proxy = await prisma.mediaFile.upsert({
		where: {
			proxyOfId_width_height_bitrate: {
				proxyOfId: job.data.mediaId,
				width: job.data.video.width,
				height: job.data.video.height,
				bitrate: job.data.video.bitRate,
			},
		},
		update: {
			status: "PROCESSING",
		},
		create: {
			proxyOfId: job.data.mediaId,
			contentType: "video/mp4",
			bitrate: job.data.video.bitRate,
			videoCodec: job.data.video.codec,
			width: job.data.video.width,
			height: job.data.video.height,
			audioCodec: job.data.audio.codec,
			status: "PROCESSING",
		},
	});
	const presignedSourceUrl = await getOriginalUrl(job.data.mediaId);
	const targetPath = getS3ObjectPath({
		mediaId: job.data.mediaId,
		type: "proxy",
		proxyId: proxy.id,
	});
	// ffmpeg reports progress several times a second; only forward it to Redis once a second
	let lastProgressUpdate = 0;
	const result = await encodeHls(
		presignedSourceUrl,
		{
			width: job.data.video.width,
			height: job.data.video.height,
			videoBitRate: job.data.video.bitRate,
			audioBitRate: job.data.audio.bitRate,
		},
		// lib-storage aborts the multipart upload itself when the body stream errors
		(body) =>
			new Upload({
				client: s3Client,
				params: {
					Bucket: env.S3_BUCKET,
					Key: targetPath,
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
	await prisma.mediaFile.update({
		where: {
			id: proxy.id,
		},
		data: {
			status: "COMPLETED",
			hls: result.hls,
			codecs: result.codecs,
			size: BigInt(result.bytes),
			duration: result.hls.segments.reduce((sum, segment) => sum + segment.duration, 0),
			audioCodec: result.hasAudio ? job.data.audio.codec : null,
		},
	});
	await job.updateProgress(1);
	// parent jobs (seek sprites) read the proxy they depend on from this
	return { proxyId: proxy.id };
}
