import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { encodeHls } from "../lib/hls.ts";
import { getOriginalUrl, s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3ObjectPath } from "@postpin-io/shared/storage";
import { prisma } from "../lib/database.ts";
import { ffprobe } from "../lib/ffmpeg.ts";
import { displaySize, hlsDuration, selectRenditions } from "@postpin-io/shared/media/hls";

/**
 * Encodes the renditions of a media in one ffmpeg run, which decodes the original only once.
 * Renditions larger than the original are skipped, so a 720p export gets 720p and 480p only.
 */
export async function transcode(job: TypedJob<typeof Queues.heavy, "transcode">) {
	const { mediaId, audio } = job.data;
	const presignedSourceUrl = await getOriginalUrl(mediaId);
	const { streams } = await ffprobe(presignedSourceUrl);
	const video = streams.find((stream) => stream.codec_type === "video");
	if (!video) throw new Error("The original has no video stream");
	const hasAudio = streams.some((stream) => stream.codec_type === "audio");
	const size = displaySize({
		width: video.width,
		height: video.height,
		rotation: video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation,
	});
	const renditions = selectRenditions(size, job.data.renditions);
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
	// ffmpeg reports progress several times a second; only forward it to Redis once a second
	let lastProgressUpdate = 0;
	const results = await encodeHls(
		{ input: presignedSourceUrl, renditions, hasAudio, audioBitRate: audio.bitRate },
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
					duration: hlsDuration(result.hls),
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
