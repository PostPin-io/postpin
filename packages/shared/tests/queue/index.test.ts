import { beforeEach, describe, expect, it, vi } from "vitest";

const bullmq = vi.hoisted(() => ({
	Queue: vi.fn(function (this: Record<string, unknown>, name: string, opts: unknown) {
		this.name = name;
		this.opts = opts;
	}),
	FlowProducer: vi.fn(function (this: Record<string, unknown>, opts: unknown) {
		this.opts = opts;
	}),
}));
vi.mock("bullmq", () => bullmq);

import {
	JobLabels,
	JobWeights,
	Queues,
	getFlowProducer,
	getQueue,
	queueOptions,
} from "../../src/queue/index.ts";

const env = { REDIS_HOST: "redis", REDIS_PORT: 6379, REDIS_USE_SSL: false };

beforeEach(() => vi.clearAllMocks());

describe("queueOptions", () => {
	it("connects without TLS by default", () => {
		expect(queueOptions(env)).toEqual({ connection: { host: "redis", port: 6379 } });
	});

	it("adds TLS when REDIS_USE_SSL is set", () => {
		expect(queueOptions({ ...env, REDIS_USE_SSL: true })).toEqual({
			connection: { host: "redis", port: 6379, tls: {} },
		});
	});
});

describe("getQueue / getFlowProducer", () => {
	it("creates a BullMQ queue with the connection options", () => {
		getQueue(Queues.heavy, env);
		expect(bullmq.Queue).toHaveBeenCalledWith("media-heavy", {
			connection: { host: "redis", port: 6379 },
		});
	});

	it("creates a flow producer with the connection options", () => {
		getFlowProducer({ ...env, REDIS_USE_SSL: true });
		expect(bullmq.FlowProducer).toHaveBeenCalledWith({
			connection: { host: "redis", port: 6379, tls: {} },
		});
	});
});

describe("job metadata", () => {
	it("has a weight and a label for the same job names", () => {
		expect(Object.keys(JobLabels).sort()).toEqual(Object.keys(JobWeights).sort());
	});

	it("weights every job positively, transcode heaviest", () => {
		const weights = Object.values(JobWeights);
		expect(weights.every((w) => w > 0)).toBe(true);
		expect(Math.max(...weights)).toBe(JobWeights.transcode);
	});
});
