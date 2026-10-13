import { getFlowProducer, Queues } from "@postpin/shared/queue";
import * as env from "$app/env/private";
import { command, query } from "$app/server";
import { s3Client } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin/shared/storage";

const flowProducer = getFlowProducer(env);

export const getVideos = query(async () => {
	const videos = await prisma.video.findMany({
		include: {
			thumbnail: true,
			transcodes: true,
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

/** The flow's parent job id is the video id, so its children are the video's processing jobs. */
async function getJobs(videoId: string) {
	const flow = await flowProducer.getFlow({ id: videoId, queueName: Queues.light });
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
	const videoId = crypto.randomUUID();
	const uploadUrl = await getPresignedUrl(s3Client, env, { videoId, type: "original" }, "put");

	await prisma.video.create({
		data: {
			id: videoId,
			status: "PENDING",
		},
	});

	return { videoId, uploadUrl };
});

export const processVideo = command(v.string(), async (videoId: string) => {
	const resolutions = [
		{ width: 1280, height: 720, bitRate: 1000000 },
		{ width: 854, height: 480, bitRate: 500000 },
		{ width: 640, height: 360, bitRate: 250000 },
	];

	await flowProducer.add({
		name: "setVideoProcessingDone",
		queueName: Queues.light,
		data: { videoId },
		opts: { jobId: videoId },
		children: [
			...resolutions.map((res) => ({
				name: "transcode" as const,
				queueName: Queues.heavy,
				data: {
					videoId,
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
				data: { videoId },
				opts: { failParentOnFailure: true },
			},
			{
				name: "thumbnail",
				queueName: Queues.light,
				data: { videoId, frame: 1, size: { width: 320 } },
				opts: { failParentOnFailure: true },
			},
		],
	});

	await prisma.video.update({
		where: {
			id: videoId,
		},
		data: {
			status: "PROCESSING",
		},
	});
});

export const getUrl = query(
	v.object({
		videoId: v.string(),
		type: v.picklist(["original", "transcoded", "thumbnail"]),
		transcodeId: v.optional(v.string()),
	}),
	async (object) => {
		return await getPresignedUrl(s3Client, env, object);
	},
);
