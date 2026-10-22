import { building } from "$app/env";
import * as env from "$app/env/private";
import { getFlowProducer, Queues, type TypedFlowProducer } from "@postpin-io/shared/queue";
import { prisma } from "#lib/server/database.ts";
import { s3Client } from "./storage";

const flowProducer = building ? (null as unknown as TypedFlowProducer) : getFlowProducer(env);

const PROXY_RESOLUTIONS = [
	{ width: 1280, height: 720, bitRate: 1000000 },
	{ width: 854, height: 480, bitRate: 500000 },
	{ width: 640, height: 360, bitRate: 250000 },
];

export async function startMediaProcessing(mediaId: string) {
	await flowProducer.add({
		name: "setMediaProcessingDone",
		queueName: Queues.light,
		data: { mediaId },
		opts: { jobId: mediaId },
		children: [
			...PROXY_RESOLUTIONS.map((res) => ({
				name: "transcode" as const,
				queueName: Queues.heavy,
				data: {
					mediaId,
					audio: {
						bitRate: 128000,
						codec: "aac",
					},
					video: {
						bitRate: res.bitRate,
						codec: "h264",
						height: res.height,
						width: res.width,
					},
				},
				opts: { failParentOnFailure: true },
			})),
			{
				name: "probe",
				queueName: Queues.light,
				data: { mediaId },
				opts: { failParentOnFailure: true },
			},
			{
				name: "thumbnail",
				queueName: Queues.light,
				data: { mediaId, frame: 1, size: { width: 320 } },
				opts: { failParentOnFailure: true },
			},
		],
	});

	await prisma.media.update({
		where: { id: mediaId },
		data: { status: "PROCESSING" },
	});
}

export async function getMediaJobs(mediaId: string) {
	const flow = await flowProducer.getFlow({ id: mediaId, queueName: Queues.light });
	return Promise.all(
		(flow?.children ?? []).map(async ({ job }) => ({
			id: job.id,
			label: job.name === "transcode" ? `transcode ${job.data.video.height}p` : job.name,
			state: await job.getState(),
			progress: typeof job.progress === "number" ? job.progress : 0,
			failedReason: job.failedReason,
		})),
	);
}

export async function deleteMediaFiles(mediaId: string) {
	let ContinuationToken: string | undefined;
	do {
		const res = await s3Client.listObjectsV2({
			Bucket: env.S3_BUCKET,
			Prefix: `${mediaId}/`,
			ContinuationToken,
		});
		const Objects = (res.Contents ?? []).map((obj) => ({ Key: obj.Key! }));
		// DeleteObjects rejects an empty list with MalformedXML
		if (Objects.length > 0) {
			await s3Client.deleteObjects({ Bucket: env.S3_BUCKET, Delete: { Objects } });
		}
		ContinuationToken = res.NextContinuationToken;
	} while (ContinuationToken);
}
