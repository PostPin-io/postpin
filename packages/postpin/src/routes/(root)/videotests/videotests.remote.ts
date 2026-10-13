import { getFlowProducer, Queues } from "@postpin/shared/queue";
import * as env from "$app/env/private";
import { command, query } from "$app/server";
import { s3Client } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin/shared/storage";

const flowProducer = getFlowProducer(env);

export const getVideos = query(async () => {
	const videos = await prisma.media.findMany({
		include: {
			original: true,
			proxies: true,
			thumbnail: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});
	return Promise.all(
		videos.map(async (video) => ({
			...video,
			jobs:
				video.status === "PROCESSING" || video.status === "FAILED" ? await getJobs(video.id) : [],
		})),
	);
});

/** The flow's parent job id is the media id, so its children are the media's processing jobs. */
async function getJobs(mediaId: string) {
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

export const getUploadUrl = command(async () => {
	const mediaId = crypto.randomUUID();
	const uploadUrl = await getPresignedUrl(s3Client, env, { mediaId, type: "original" }, "put");

	await prisma.media.create({
		data: {
			id: mediaId,
			status: "PENDING",
			original: { create: {} },
		},
	});

	return { mediaId, uploadUrl };
});

export const processVideo = command(v.string(), async (mediaId: string) => {
	const resolutions = [
		{ width: 1280, height: 720, bitRate: 1000000 },
		{ width: 854, height: 480, bitRate: 500000 },
		{ width: 640, height: 360, bitRate: 250000 },
	];

	await flowProducer.add({
		name: "setMediaProcessingDone",
		queueName: Queues.light,
		data: { mediaId },
		opts: { jobId: mediaId },
		children: [
			...resolutions.map((res) => ({
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
		where: {
			id: mediaId,
		},
		data: {
			status: "PROCESSING",
		},
	});
});

export const getUrl = query(
	v.object({
		mediaId: v.string(),
		type: v.picklist(["original", "proxy", "thumbnail"]),
		proxyId: v.optional(v.string()),
	}),
	async (object) => {
		return await getPresignedUrl(s3Client, env, object);
	},
);
