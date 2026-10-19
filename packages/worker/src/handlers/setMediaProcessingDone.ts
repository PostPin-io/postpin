import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";

export async function setMediaProcessingDone(
	job: TypedJob<typeof Queues.light, "setMediaProcessingDone">,
) {
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
