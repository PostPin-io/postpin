import type { Queues } from "@postpin/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";

export async function setVideoProcessingDone(
	job: TypedJob<typeof Queues.light, "setVideoProcessingDone">,
) {
	await prisma.video.update({
		where: {
			id: job.data.videoId,
		},
		data: {
			status: "COMPLETED",
		},
	});
	console.log("Done ✅");
}
