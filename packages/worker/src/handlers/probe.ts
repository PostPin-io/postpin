import type { Queues } from "@postpin/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { ffprobe } from "../lib/ffmpeg.ts";
import { getOriginalUrl } from "../lib/storage.ts";
import { prisma } from "../lib/database.ts";

export async function probe(job: TypedJob<typeof Queues.light, "probe">) {
	console.log(`🎉 Processing job ${job.id} of type ${job.name}`, job.data);
	const metadata = await ffprobe(await getOriginalUrl(job.data.videoId));
	const firstVideoStream = metadata.streams.find((stream) => stream.codec_type === "video");
	await prisma.video.update({
		where: {
			id: job.data.videoId,
		},
		data: {
			bitrate: metadata.format.bit_rate ?? null,
			contentType: metadata.format.format_name,
			height: firstVideoStream?.height ?? null,
			width: firstVideoStream?.width ?? null,
		},
	});
	console.log("Done ✅");
}
