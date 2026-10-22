import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { getPresignedUrl, getS3ObjectPath } from "@postpin-io/shared/storage";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";
import { getShots, type Shot } from "@postpin-io/shared/logic/shots";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { Upload } from "@aws-sdk/lib-storage";
import { secondsAtFrame } from "@postpin-io/shared/logic/timecode";
import type { ShotThumbnails } from "@postpin-io/shared/types/ShotThumbnails";

const WIDTH = 320;
const HEIGHT = 180;
// each ffmpeg only range-requests around its seek point, so a few in parallel stay cheap
const CONCURRENCY = 4;

/** One JPEG per shot of the export's timeline snapshot, letterboxed into a fixed 16:9 box */
export async function shotThumbnails(job: TypedJob<typeof Queues.light, "shotThumbnails">) {
	const { mediaId } = job.data;
	const exprt = await prisma.export.findUniqueOrThrow({ where: { mediaId } });
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
					Key: getS3ObjectPath({ mediaId, type: "shotThumbnails", index: shot.index }),
					Body: thumbnailStream.stdout,
					ContentType: "image/jpeg",
				},
			}).done(),
			thumbnailStream.done,
		]);
	}

	let next = 0;
	let done = 0;
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, shots.length) }, async () => {
			while (next < shots.length) {
				await render(shots[next++]!);
				await job.updateProgress(++done / shots.length);
			}
		}),
	);

	await prisma.media.update({
		where: { id: mediaId },
		data: {
			shotThumbnails: {
				count: shots.length,
				width: WIDTH,
				height: HEIGHT,
			} satisfies ShotThumbnails,
		},
	});
}
