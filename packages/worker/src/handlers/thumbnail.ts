import type { Queues, ThumbnailMessage } from "@postpin/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { getOriginalUrl, s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { Upload } from "@aws-sdk/lib-storage";
import { prisma } from "../lib/database.ts";
import { getS3ObjectPath } from "@postpin/shared/storage";

function scaleFilter(size: ThumbnailMessage["size"]) {
	// -2 keeps the aspect ratio while rounding to an even number of pixels
	const width = "width" in size ? size.width : -2;
	const height = "height" in size ? size.height : -2;
	return `scale=${width}:${height}`;
}

export async function thumbnail(job: TypedJob<typeof Queues.light, "thumbnail">) {
	const presignedSourceUrl = await getOriginalUrl(job.data.videoId);
	const targetPath = getS3ObjectPath({ videoId: job.data.videoId, type: "thumbnail" });
	const thumbnailStream = ffmpeg([
		"-i",
		presignedSourceUrl,
		"-vf",
		`select=eq(n\\,${job.data.frame}),${scaleFilter(job.data.size)}`,
		"-vframes",
		"1",
		"-f",
		"image2pipe",
		"-c:v",
		"png",
		"-nostdin",
		"pipe:1",
	]);
	await Promise.all([
		new Upload({
			client: s3Client,
			params: {
				Bucket: env.S3_BUCKET,
				Key: targetPath,
				Body: thumbnailStream.stdout,
				ContentType: "image/png",
			},
		}).done(),
		thumbnailStream.done,
	]);

	await prisma.thumbnail.upsert({
		where: {
			videoId: job.data.videoId,
		},
		update: {
			contentType: "image/png",
			frame: job.data.frame,
			status: "COMPLETED",
		},
		create: {
			videoId: job.data.videoId,
			contentType: "image/png",
			frame: job.data.frame,
			status: "COMPLETED",
		},
	});

	console.log("Done ✅");
}
