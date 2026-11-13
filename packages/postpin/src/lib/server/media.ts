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
import { proxyTranscodeMessage } from "@postpin-io/shared/media/hls";

const flowProducer = building ? (null as unknown as TypedFlowProducer) : getFlowProducer(env);
const lightQueue = building ? null : getQueue(Queues.light, env);

// one job for all renditions: ffmpeg decodes the original once and encodes them side by side.
// The worker skips the renditions larger than the original.
const transcodeJob = (mediaId: string): TypedFlowChildJob => ({
	name: "transcode",
	queueName: Queues.heavy,
	data: proxyTranscodeMessage(mediaId),
	opts: { failParentOnFailure: true },
});

// The plugin's proxies: checked before sprites and barcode read the smallest one. Proxies that don't
// check out are replaced by a server transcode, which this job then waits for.
const verifyProxiesJob = (mediaId: string): TypedFlowChildJob => ({
	name: "verifyProxies",
	queueName: Queues.light,
	data: { mediaId },
	opts: { failParentOnFailure: true },
});

const lightJob = <N extends "probe" | "sceneDetect" | "shotThumbnails">(
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
 * (and the cut detection) replace, so their shot thumbnails wait for those: probe → sceneDetect →
 * shotThumbnails. Plugin snapshots are final, so everything runs side by side.
 * `transcode: false` when the plugin uploaded the proxies already: then seekSprites waits for
 * verifyProxies instead of a transcode.
 */
export async function startMediaProcessing(
	mediaId: string,
	opts: { webUpload?: boolean; detectCuts?: boolean; transcode?: boolean } = {},
) {
	const transcode = opts.transcode ?? true;
	// stored before the jobs exist, so the shot thumbnails job finds itself current
	const generation = newShotThumbnailsGeneration();
	await prisma.media.update({
		where: { id: mediaId },
		data: { shotThumbnailsGeneration: generation },
	});
	const probe = lightJob("probe", { mediaId });
	const shotThumbnails = { mediaId, generation };
	const shots = !opts.webUpload
		? [probe, lightJob("shotThumbnails", shotThumbnails)]
		: [
				lightJob(
					"shotThumbnails",
					shotThumbnails,
					opts.detectCuts ? [lightJob("sceneDetect", { mediaId }, [probe])] : [probe],
				),
			];
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
						// both return the smallest proxy, which sprites and barcode read
						children: [transcode ? transcodeJob(mediaId) : verifyProxiesJob(mediaId)],
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
