import type { Queues } from "@postpin-io/shared/queue";
import type { Prisma } from "@postpin-io/shared/db";
import { applyProbe, isWebUpload } from "@postpin-io/shared/logic/web-upload";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import type { TypedJob } from "../lib/worker.ts";
import { ffprobe, probedTimecode, type ProbeResult } from "../lib/ffmpeg.ts";
import { getOriginalUrl } from "../lib/storage.ts";
import { prisma } from "../lib/database.ts";

export async function probe(job: TypedJob<typeof Queues.light, "probe">) {
	console.log(`🎉 Processing job ${job.id} of type ${job.name}`, job.data);
	const metadata = await ffprobe(await getOriginalUrl(job.data.mediaId));
	const videoStream = metadata.streams.find((stream) => stream.codec_type === "video");
	const audioStream = metadata.streams.find((stream) => stream.codec_type === "audio");
	await prisma.media.update({
		where: {
			id: job.data.mediaId,
		},
		data: {
			original: {
				update: {
					status: "COMPLETED",
					contentType: metadata.format.format_name,
					duration: metadata.format.duration ?? null,
					bitrate: metadata.format.bit_rate ?? null,
					videoCodec: videoStream?.codec_name ?? null,
					width: videoStream?.width ?? null,
					height: videoStream?.height ?? null,
					frameRate: videoStream?.avg_frame_rate || null,
					audioCodec: audioStream?.codec_name ?? null,
					sampleRate: audioStream?.sample_rate ?? null,
					channels: audioStream?.channels ?? null,
					// keep the reservation from init-upload if ffprobe can't tell
					size: metadata.format.size != null ? BigInt(metadata.format.size) : undefined,
				},
			},
		},
	});
	await updateWebUploadSnapshot(job.data.mediaId, metadata);
	console.log("Done ✅");
}

/**
 * Web uploads only: replaces the estimates of the upload form with the file's frame rate, start
 * timecode and length, except for values the uploader set. Plugin snapshots stay as they are.
 */
async function updateWebUploadSnapshot(mediaId: string, metadata: ProbeResult) {
	const exp = await prisma.export.findUnique({
		where: { mediaId },
		select: { id: true, timelineSnapshot: true },
	});
	const snapshot = exp?.timelineSnapshot as TimelineSnapshot | null | undefined;
	if (!exp || !isWebUpload(snapshot)) return;

	const video = metadata.streams.find((stream) => stream.codec_type === "video");
	const fps = video?.avg_frame_rate || video?.r_frame_rate || null;
	const updated = applyProbe(snapshot, {
		fps,
		timecode: probedTimecode(metadata),
		frameCount: video?.nb_frames ?? null,
		durationSeconds: video?.duration ?? metadata.format.duration ?? null,
	});
	await prisma.export.update({
		where: { id: exp.id },
		data: { timelineSnapshot: updated as unknown as Prisma.JsonObject },
	});
}
