import { Queues } from "@postpin-io/shared/queue";
import { queues } from "./lib/config.ts";
import { env } from "./lib/env.ts";
import { heavyHandlers, lightHandlers } from "./lib/queue.ts";
import { createWorker } from "./lib/worker.ts";
import { prisma } from "./lib/database.ts";
import { storeImageSizes } from "./lib/image-sizes.ts";
import { registerShutdown, SHUTDOWN_TIMEOUT_MS } from "./lib/shutdown.ts";

export const heavyWorker = createWorker(Queues.heavy, heavyHandlers, env, queues[Queues.heavy]);
export const lightWorker = createWorker(Queues.light, lightHandlers, env, queues[Queues.light]);

lightWorker.on("failed", async (job) => {
	if (job?.name !== "setMediaProcessingDone") return;
	await prisma.media.update({
		where: {
			id: job.data.mediaId,
		},
		data: {
			status: "FAILED",
		},
	});
	// images of the steps that did succeed still take up space
	await storeImageSizes(job.data.mediaId).catch((err: unknown) =>
		console.error(`Measuring the images of ${job.data.mediaId} failed`, err),
	);
});

registerShutdown({
	workers: [heavyWorker, lightWorker],
	timeoutMs: SHUTDOWN_TIMEOUT_MS,
	cleanup: () => prisma.$disconnect(),
});
