import { Queues, getQueue } from "@postpin-io/shared/queue";
import { queues } from "./lib/config.ts";
import { env } from "./lib/env.ts";
import { createWorker } from "./lib/worker.ts";
import { prisma } from "./lib/database.ts";
import { storeImageSizes } from "./lib/image-sizes.ts";
import { registerShutdown, SHUTDOWN_TIMEOUT_MS } from "./lib/shutdown.ts";
import { heavyHandlers, lightHandlers, maintenanceHandlers } from "./lib/queue.ts";

export const heavyWorker = createWorker(Queues.heavy, heavyHandlers, env, queues[Queues.heavy]);
export const lightWorker = createWorker(Queues.light, lightHandlers, env, queues[Queues.light]);

export const maintenanceWorker = createWorker(
	Queues.maintenance,
	maintenanceHandlers,
	env,
	queues[Queues.maintenance],
);

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

const maintenanceQueue = getQueue(Queues.maintenance, env);
await maintenanceQueue.upsertJobScheduler(
	"cleanup-daily",
	{ pattern: "0 3 * * *", tz: "Europe/Berlin" },
	{ name: "cleanup", data: {}, opts: { removeOnComplete: 30, removeOnFail: 100 } },
);

registerShutdown({
	workers: [heavyWorker, lightWorker, maintenanceWorker],
	timeoutMs: SHUTDOWN_TIMEOUT_MS,
	cleanup: () => Promise.all([maintenanceQueue.close(), prisma.$disconnect()]),
});
