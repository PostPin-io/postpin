import type { WorkerOptions } from "bullmq";
import { Queues, type QueueName } from "@postpin-io/shared/queue";

export const queues = {
	[Queues.heavy]: { concurrency: 1 },
	[Queues.light]: { concurrency: 8 },
} satisfies Record<QueueName, Omit<WorkerOptions, "connection">>;
