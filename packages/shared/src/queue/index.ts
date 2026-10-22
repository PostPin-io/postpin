import {
	FlowProducer,
	Queue,
	type ConnectionOptions,
	type FlowJob,
	type FlowJobNode,
	type FlowOpts,
	type Job,
	type JobNode,
	type JobsOptions,
} from "bullmq";
import type { RedisEnv } from "../env/index.ts";
import type {
	ProbeMessage,
	SeekSpritesMessage,
	SetMediaProcessingDoneMessage,
	ThumbnailMessage,
	TranscodeMessage,
} from "./messages.ts";
export type * from "./messages.ts";

export const JobWeights: {
	[N in keyof QueueJobs["media-heavy"] | keyof QueueJobs["media-light"]]: number;
} = {
	transcode: 100,
	thumbnail: 10,
	probe: 10,
	setMediaProcessingDone: 1,
	seekSprites: 50,
};

export const JobLabels: {
	[N in keyof QueueJobs["media-heavy"] | keyof QueueJobs["media-light"]]: string;
} = {
	transcode: "Transcode",
	thumbnail: "Generate Thumbnail",
	probe: "Analyze Media",
	setMediaProcessingDone: "Done",
	seekSprites: "Seek Thumbnails",
};

export const Queues = { heavy: "media-heavy", light: "media-light" } as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

export interface QueueJobs {
	[Queues.heavy]: { transcode: TranscodeMessage };
	[Queues.light]: {
		thumbnail: ThumbnailMessage;
		probe: ProbeMessage;
		setMediaProcessingDone: SetMediaProcessingDoneMessage;
		seekSprites: SeekSpritesMessage;
	};
}

export type JobName<Q extends QueueName> = keyof QueueJobs[Q] & string;
export type JobData<Q extends QueueName, N extends JobName<Q>> = QueueJobs[Q][N];

export type QueueJob<Q extends QueueName> = {
	[N in JobName<Q>]: Job<JobData<Q, N>, unknown, N>;
}[JobName<Q>];

export interface TypedQueue<Q extends QueueName> extends Omit<Queue, "add" | "addBulk"> {
	add<N extends JobName<Q>>(
		name: N,
		data: JobData<Q, N>,
		opts?: JobsOptions,
	): Promise<Job<JobData<Q, N>, unknown, N>>;
	addBulk(
		jobs: { [N in JobName<Q>]: { name: N; data: JobData<Q, N>; opts?: JobsOptions } }[JobName<Q>][],
	): Promise<QueueJob<Q>[]>;
}

export function queueOptions(env: RedisEnv): { connection: ConnectionOptions } {
	return {
		connection: {
			host: env.REDIS_HOST,
			port: env.REDIS_PORT,
			...(env.REDIS_USE_SSL && { tls: {} }),
		},
	};
}

export function getQueue<Q extends QueueName>(name: Q, env: RedisEnv): TypedQueue<Q> {
	return new Queue(name, queueOptions(env)) as unknown as TypedQueue<Q>;
}

type TypedFlowNode<Opts> = {
	[Q in QueueName]: {
		[N in JobName<Q>]: {
			name: N;
			queueName: Q;
			data: JobData<Q, N>;
			prefix?: string;
			opts?: Opts;
			children?: TypedFlowChildJob[];
		};
	}[JobName<Q>];
}[QueueName];

export type TypedFlowChildJob = TypedFlowNode<FlowJobNode["opts"]>;
export type TypedFlowJob = TypedFlowNode<FlowJob["opts"]>;

export interface TypedFlowProducer extends Omit<FlowProducer, "add" | "addBulk"> {
	add(flow: TypedFlowJob, opts?: FlowOpts): Promise<JobNode>;
	addBulk(flows: TypedFlowJob[]): Promise<JobNode[]>;
}

export function getFlowProducer(env: RedisEnv): TypedFlowProducer {
	return new FlowProducer(queueOptions(env)) as unknown as TypedFlowProducer;
}
