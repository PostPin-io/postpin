import { building } from "$app/env";
import * as env from "$app/env/private";
import {
	getFlowProducer,
	getQueue,
	JobLabels,
	Queues,
	type TypedFlowChildJob,
	type TypedFlowProducer,
} from "@postpin-io/shared/queue";
import { prisma } from "#lib/server/database.ts";
import { s3Client } from "./storage";
import { JobWeights } from "@postpin-io/shared/queue";
import type { Prisma } from "@postpin-io/shared/db";
import { newShotThumbnailsGeneration } from "@postpin-io/shared/types/ShotThumbnails";

const flowProducer = building ? (null as unknown as TypedFlowProducer) : getFlowProducer(env);
const lightQueue = building ? null : getQueue(Queues.light, env);

const KBits = 1000;

const PROXY_RESOLUTIONS = [
	{ width: 1920, height: 1080, bitRate: 8000 * KBits },
	{ width: 1280, height: 720, bitRate: 3500 * KBits },
	{ width: 854, height: 480, bitRate: 1200 * KBits },
];
// one job for all renditions: ffmpeg decodes the original once and encodes them side by side
const transcodeJob = (mediaId: string): TypedFlowChildJob => ({
	name: "transcode",
	queueName: Queues.heavy,
	data: {
		mediaId,
		audio: { bitRate: 128_000, codec: "aac" },
		renditions: PROXY_RESOLUTIONS.map((rendition) => ({ ...rendition, codec: "h264" })),
	},
	opts: { failParentOnFailure: true },
});

const lightJob = <N extends "probe" | "sceneDetect" | "cutList" | "shotThumbnails">(
	name: N,
	data: { mediaId: string; generation?: string },
	children?: TypedFlowChildJob[],
) =>
	({
		name,
		queueName: Queues.light,
		data,
		opts: { failParentOnFailure: true },
		...(children && { children }),
	}) as TypedFlowChildJob;

/**
 * Queues the processing of an uploaded original. Web uploads have an estimated snapshot that probe
 * (and the cut detection, and the cut list) replace, so their shot thumbnails wait for those:
 * probe → sceneDetect → cutList → shotThumbnails. The cut list comes last: its tracks win, and
 * the detected cuts are what is left when it can't be used. Plugin snapshots are final, so
 * everything runs side by side.
 */
export async function startMediaProcessing(
	mediaId: string,
	opts: { webUpload?: boolean; detectCuts?: boolean; cutList?: boolean } = {},
) {
	// stored before the jobs exist, so the shot thumbnails job finds itself current
	const generation = newShotThumbnailsGeneration();
	await prisma.media.update({
		where: { id: mediaId },
		data: { shotThumbnailsGeneration: generation },
	});
	const probe = lightJob("probe", { mediaId });
	const shotThumbnails = { mediaId, generation };
	const timing = opts.detectCuts ? lightJob("sceneDetect", { mediaId }, [probe]) : probe;
	const cuts = opts.cutList ? lightJob("cutList", { mediaId }, [timing]) : timing;
	const shots = !opts.webUpload
		? [probe, lightJob("shotThumbnails", shotThumbnails)]
		: [lightJob("shotThumbnails", shotThumbnails, [cuts])];
	await flowProducer.add({
		name: "setMediaProcessingDone",
		queueName: Queues.light,
		data: { mediaId },
		opts: { jobId: mediaId },
		children: [
			...shots.slice(0, 1),
			{
				name: "thumbnail",
				queueName: Queues.light,
				data: { mediaId, frame: 1, size: { width: 320 } },
				opts: { failParentOnFailure: true },
			},
			{
				name: "movieBarcode",
				queueName: Queues.light,
				data: { mediaId },
				opts: { failParentOnFailure: true },
				children: [
					{
						name: "seekSprites",
						queueName: Queues.light,
						data: { mediaId },
						opts: { failParentOnFailure: true },
						// the transcode returns its smallest proxy, which sprites and barcode read
						children: [transcodeJob(mediaId)],
					},
				],
			},
			...shots.slice(1),
		],
	});

	await prisma.media.update({
		where: { id: mediaId },
		data: { status: "PROCESSING" },
	});
}

/**
 * Renders the shot thumbnails again, after the shots of the snapshot changed. Store `generation`
 * as the media's shotThumbnailsGeneration together with the new snapshot first: an older render
 * that is still running then doesn't publish.
 */
export async function renderShotThumbnails(mediaId: string, generation: string) {
	await lightQueue!.add(
		"shotThumbnails",
		{ mediaId, generation },
		// unique: the processing flow's job may still be kept under the plain id
		{ jobId: `shotThumbnails-${mediaId}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 },
	);
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
				label: JobLabels[job.name as keyof typeof JobLabels] ?? job.name,
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
/**
 * Deletes markers and media of all matching exports, inside the caller's transaction.
 * Returns the media ids whose bucket folders the caller removes AFTER commit.
 *
 * Markers go first: Postgres checks marker_categoryId_fkey (NO ACTION) right after a
 * cascade deletes categories, before another cascade path reaches the markers.
 * Then the original media files: their cascade removes media, exports, proxies and
 * thumbnails. Exports without media are left to the caller (or the parent's cascade).
 */
export async function purgeExports(tx: Prisma.TransactionClient, where: Prisma.ExportWhereInput) {
	const exports = await tx.export.findMany({
		where,
		select: { id: true, mediaId: true, media: { select: { originalId: true } } },
	});
	const exportIds = exports.map((e) => e.id);
	const mediaIds = exports.flatMap((e) => (e.mediaId ? [e.mediaId] : []));
	const originalIds = exports.flatMap((e) => (e.media ? [e.media.originalId] : []));

	// responses cascade with their marker
	await tx.marker.deleteMany({ where: { exportId: { in: exportIds } } });

	await tx.mediaFile.deleteMany({ where: { id: { in: originalIds } } });

	return mediaIds;
}

/** Bucket cleanup after the DB commit. Failures only leave orphaned files, never broken rows. */
export async function deleteMediaFolders(mediaIds: string[], context: string) {
	const results = await Promise.allSettled(mediaIds.map((id) => deleteMediaFiles(id)));
	const failed = results.filter((r) => r.status === "rejected").length;
	if (failed > 0) console.error(`${context}: ${failed} media folders left in the bucket`);
}

type NonOptional<T> = T extends null | undefined ? never : T;
