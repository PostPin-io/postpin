import type { Queues } from "@postpin/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { ffprobe } from "../lib/ffmpeg.ts";
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
					size: metadata.format.size != null ? BigInt(metadata.format.size) : null,
					duration: metadata.format.duration ?? null,
					bitrate: metadata.format.bit_rate ?? null,
					videoCodec: videoStream?.codec_name ?? null,
					width: videoStream?.width ?? null,
					height: videoStream?.height ?? null,
					frameRate: videoStream?.avg_frame_rate || null,
					audioCodec: audioStream?.codec_name ?? null,
					sampleRate: audioStream?.sample_rate ?? null,
					channels: audioStream?.channels ?? null,
				},
			},
		},
	});
	console.log("Done ✅");
}
