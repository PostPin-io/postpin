import { building } from "$app/env";
import * as env from "$app/env/private";
import {
	getFlowProducer,
	JobLabels,
	Queues,
	type TypedFlowChildJob,
	type TypedFlowProducer,
} from "@postpin-io/shared/queue";
import { prisma } from "#lib/server/database.ts";
import { s3Client } from "./storage";
import { JobWeights } from "@postpin-io/shared/queue";

const flowProducer = building ? (null as unknown as TypedFlowProducer) : getFlowProducer(env);

const KBits = 1000;

const PROXY_RESOLUTIONS = [
	{ width: 1920, height: 1080, bitRate: 8000 * KBits },
	{ width: 1280, height: 720, bitRate: 3500 * KBits },
	{ width: 854, height: 480, bitRate: 1200 * KBits },
];
const transcodeJob = (
	mediaId: string,
	rendition: (typeof PROXY_RESOLUTIONS)[number],
): TypedFlowChildJob => ({
	name: "transcode",
	queueName: Queues.heavy,
	data: {
		mediaId,
		audio: { bitRate: 128_000, codec: "aac" },
		video: { ...rendition, codec: "h264" },
	},
	opts: { failParentOnFailure: true },
});

export async function startMediaProcessing(mediaId: string) {
	const [r1080, r720, r480] = PROXY_RESOLUTIONS;
	await flowProducer.add({
		name: "setMediaProcessingDone",
		queueName: Queues.light,
		data: { mediaId },
		opts: { jobId: mediaId },
		children: [
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
			{
				name: "seekSprites",
				queueName: Queues.light,
				data: { mediaId },
				opts: { failParentOnFailure: true },
				children: [transcodeJob(mediaId, r480!)],
			},
			transcodeJob(mediaId, r1080!),
			transcodeJob(mediaId, r720!),
		],
	});

	await prisma.media.update({
		where: { id: mediaId },
		data: { status: "PROCESSING" },
	});
}

export async function getMediaJobs(mediaId: string) {
	const flow = await flowProducer.getFlow({ id: mediaId, queueName: Queues.light });
	function flatten(nodes: typeof flow.children = []): NonOptional<typeof flow.children>[number][] {
		return nodes.flatMap((node) => [node, ...flatten(node.children)]);
	}
	const statusOrder = [
		"unknown",
		"active",
		"delayed",
		"waiting-children",
		"waiting",
		"prioritized",
		"failed",
		"completed",
	];
	return (
		await Promise.all(
			flatten(flow?.children).map(async ({ job }) => ({
				id: job.id,
				label: `${JobLabels[job.name as keyof typeof JobLabels] ?? job.name}${job.name === "transcode" ? ` ${job.data.video.height}p` : ""}`,
				state: await job.getState(),
				progress: typeof job.progress === "number" ? job.progress : 0,
				failedReason: job.failedReason,
				weight: JobWeights[job.name as keyof typeof JobWeights] ?? 1,
			})),
		)
	).sort((a, b) => {
		const d = statusOrder.indexOf(a.state) - statusOrder.indexOf(b.state);
		if (d !== 0) return d;
		return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
	});
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

type NonOptional<T> = T extends null | undefined ? never : T;
