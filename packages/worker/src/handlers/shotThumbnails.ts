import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { deleteShotThumbnails, getPresignedUrl, getS3ObjectPath } from "@postpin-io/shared/storage";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { storeImageSizes } from "../lib/image-sizes.ts";
import { getShots, type Shot } from "@postpin-io/shared/logic/shots";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { Upload } from "@aws-sdk/lib-storage";
import { secondsAtFrame } from "@postpin-io/shared/logic/timecode";
import type { ShotThumbnails } from "@postpin-io/shared/types/ShotThumbnails";

const WIDTH = 320;
const HEIGHT = 180;
// each ffmpeg only range-requests around its seek point, so a few in parallel stay cheap
const CONCURRENCY = 4;
/** How often the images that are ready so far are published, so the page can show them */
export const PROGRESS_INTERVAL_MS = 1000;

/**
 * One JPEG per shot of the export's timeline snapshot, letterboxed into a fixed 16:9 box.
 *
 * Changing the cuts queues a new render while older ones may still run. Each render is a
 * generation with its own S3 keys, and only the media's current shotThumbnailsGeneration
 * publishes; a render that was overtaken deletes its images instead. The snapshot and the
 * generation are read together and changed together, so the shots always fit the generation.
 */
export async function shotThumbnails(job: TypedJob<typeof Queues.light, "shotThumbnails">) {
	const { mediaId } = job.data;
	// Jobs queued before generations existed (an update while media were processing) have none.
	// They belong to media without one and use the keys without a generation, as before.
	const generation: string | null = job.data.generation ?? null;
	const exprt = await prisma.export.findUniqueOrThrow({
		where: { mediaId },
		select: { timelineSnapshot: true, media: { select: { shotThumbnailsGeneration: true } } },
	});
	if ((exprt.media?.shotThumbnailsGeneration ?? null) !== generation) {
		console.log(`Shot thumbnails ${generation} of ${mediaId} were overtaken, skipped`);
		return;
	}
	if (!exprt.timelineSnapshot) throw new Error("shotThumbnails needs a timeline snapshot");
	const snapshot = exprt.timelineSnapshot as unknown as TimelineSnapshot;
	const shots = getShots(snapshot);
	const presignedSourceUrl = await getPresignedUrl(s3Client, env, { mediaId, type: "original" });

	async function render(shot: Shot) {
		const thumbnailStream = ffmpeg([
			"-nostdin",
			// -ss before -i seeks to the keyframe before, then decodes up to the exact frame
			"-ss",
			`${secondsAtFrame(shot.thumbnailFrame, snapshot)}`,
			"-i",
			presignedSourceUrl,
			"-vf",
			`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
				`pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
			"-frames:v",
			"1",
			"-c:v",
			"mjpeg",
			"-q:v",
			"4",
			"-f",
			"image2pipe",
			"pipe:1",
		]);
		await Promise.all([
			new Upload({
				client: s3Client,
				params: {
					Bucket: env.S3_BUCKET,
					Key: getS3ObjectPath({
						mediaId,
						type: "shotThumbnails",
						generation: generation ?? undefined,
						index: shot.index,
					}),
					Body: thumbnailStream.stdout,
					ContentType: "image/jpeg",
				},
			}).done(),
			thumbnailStream.done,
		]);
	}

	/**
	 * Conditional: a newer render may have been requested while this one ran. `ready` while it
	 * still runs. Resolves with whether this render is still the current one.
	 */
	const publish = async (ready?: number) => {
		const { count } = await prisma.media.updateMany({
			where: { id: mediaId, shotThumbnailsGeneration: generation },
			data: {
				shotThumbnails: {
					count: shots.length,
					width: WIDTH,
					height: HEIGHT,
					...(generation && { generation }),
					...(ready !== undefined && { ready }),
				} satisfies ShotThumbnails,
			},
		});
		return count > 0;
	};

	// The shots are taken in order, but finish in any order: what the page can show is the
	// unbroken run from the first shot, at most CONCURRENCY - 1 behind
	let next = 0;
	let done = 0;
	const finished = new Set<number>();
	let ready = 0;
	let publishedReady = 0;
	let lastPublish = Date.now();
	let overtaken = false;
	const reportProgress = async () => {
		while (finished.has(ready)) ready++;
		if (ready === publishedReady || ready === shots.length) return;
		if (Date.now() - lastPublish < PROGRESS_INTERVAL_MS) return;
		lastPublish = Date.now();
		publishedReady = ready;
		// a newer render took over: stop rendering images nobody will see
		if (!(await publish(ready))) overtaken = true;
	};

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, shots.length) }, async () => {
			while (next < shots.length && !overtaken) {
				const shot = shots[next++]!;
				await render(shot);
				finished.add(shot.index);
				await job.updateProgress(++done / shots.length);
				await reportProgress();
			}
		}),
	);

	const published = !overtaken && (await publish());
	if (!published) {
		console.log(`Shot thumbnails ${generation} of ${mediaId} were overtaken, deleting them`);
		// leftovers only cost space; the job itself did nothing wrong
		await deleteShotThumbnails(s3Client, env, mediaId, (g) => g === generation).catch(
			(err: unknown) => console.error(`Deleting shot thumbnails of ${mediaId} failed`, err),
		);
		return;
	}
	// Only older generations: a newer render that is running keeps its images. Keys without a
	// generation are from before generations existed (nothing is older than those).
	if (generation !== null) {
		await deleteShotThumbnails(s3Client, env, mediaId, (g) => g === null || g < generation).catch(
			(err: unknown) => console.error(`Deleting old shot thumbnails of ${mediaId} failed`, err),
		);
	}
	// After the cleanup, so the old images aren't counted. setMediaProcessingDone measures after
	// the first processing, but a render after changing the cuts runs on its own. A failed
	// measurement only leaves the storage stats behind; the thumbnails are fine.
	await storeImageSizes(mediaId).catch((err: unknown) =>
		console.error(`Measuring the images of ${mediaId} failed`, err),
	);
}
