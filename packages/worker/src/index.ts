import { Queues } from "@postpin/shared/queue";
import { queues } from "./lib/config.ts";
import { env } from "./lib/env.ts";
import { heavyHandlers, lightHandlers } from "./lib/queue.ts";
import { createWorker } from "./lib/worker.ts";
import { prisma } from "./lib/database.ts";

export const heavyWorker = createWorker(Queues.heavy, heavyHandlers, env, queues[Queues.heavy]);
export const lightWorker = createWorker(Queues.light, lightHandlers, env, queues[Queues.light]);

lightWorker.on("failed", async (job) => {
	if (job?.name !== "setVideoProcessingDone") return;
	await prisma.video.update({
		where: {
			id: job.data.videoId,
		},
		data: {
			status: "FAILED",
		},
	});
});
