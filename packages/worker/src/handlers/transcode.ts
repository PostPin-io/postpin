import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { ffmpeg } from "../lib/ffmpeg.ts";
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
	const transcodedStream = ffmpeg(
		[
			"-i",
			presignedSourceUrl,
			"-c:v",
			job.data.video.codec,
			"-b:v",
			job.data.video.bitRate.toString(),
			"-s",
			`${job.data.video.width}x${job.data.video.height}`,
			"-c:a",
			job.data.audio.codec,
			"-b:a",
			job.data.audio.bitRate.toString(),
			"-f",
			"mp4",
			"-movflags",
			"frag_keyframe+empty_moov",
			"-nostdin",
			"pipe:1",
		],
		(progress) => {
			const now = Date.now();
			if (now - lastProgressUpdate < 1000) return;
			lastProgressUpdate = now;
			job.updateProgress(progress).catch(console.error);
		},
	);
	await Promise.all([
		new Upload({
			client: s3Client,
			params: {
				Bucket: env.S3_BUCKET,
				Key: targetPath,
				Body: transcodedStream.stdout,
				ContentType: "video/mp4",
			},
		}).done(),
		transcodedStream.done,
	]);
	await prisma.mediaFile.update({
		where: {
			id: proxy.id,
		},
		data: {
			status: "COMPLETED",
		},
	});
	await job.updateProgress(1);
}
