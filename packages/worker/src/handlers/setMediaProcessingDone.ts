import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { storeImageSizes } from "../lib/image-sizes.ts";

export async function setMediaProcessingDone(
	job: TypedJob<typeof Queues.light, "setMediaProcessingDone">,
) {
	// a failed listing only leaves the image sizes out of the storage stats, the video still works
	await storeImageSizes(job.data.mediaId).catch((err: unknown) =>
		console.error(`Measuring the images of ${job.data.mediaId} failed`, err),
	);
	await prisma.media.update({
		where: {
			id: job.data.mediaId,
		},
		data: {
			status: "COMPLETED",
		},
	});
	console.log("Done ✅");
}
