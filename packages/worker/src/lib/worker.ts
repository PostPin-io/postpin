import { Worker, type Job, type Processor, type WorkerOptions } from "bullmq";
import { queueOptions, type JobData, type JobName, type QueueName } from "@postpin/shared/queue";
import type { RedisEnv } from "@postpin/shared/env";

type ProcessorArgs = Parameters<Processor> extends [unknown, ...infer R] ? R : never;

export type TypedJob<Q extends QueueName, N extends JobName<Q>> = Job<JobData<Q, N>, unknown, N>;

export type JobHandlers<Q extends QueueName> = {
	[N in JobName<Q>]: (job: TypedJob<Q, N>, ...args: ProcessorArgs) => Promise<unknown>;
};

export function createWorker<Q extends QueueName>(
	name: Q,
	handlers: JobHandlers<Q>,
	redis: RedisEnv,
	opts?: Omit<WorkerOptions, "connection">,
) {
	return new Worker(
		name,
		(job: Job, ...args: ProcessorArgs) => {
			const handler = handlers[job.name as JobName<Q>] as
				((job: Job, ...args: ProcessorArgs) => Promise<unknown>) | undefined;
			if (!handler) throw new Error(`No handler for job "${job.name}" on queue "${name}"`);
			return handler(job, ...args);
		},
		{ ...opts, ...queueOptions(redis) },
	);
}
