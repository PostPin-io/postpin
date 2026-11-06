import { beforeEach, describe, expect, it, vi } from "vitest";

const bullmq = vi.hoisted(() => ({
	Worker: vi.fn(function (
		this: Record<string, unknown>,
		name: string,
		processor: unknown,
		opts: unknown,
	) {
		Object.assign(this, { name, processor, opts });
	}),
}));
vi.mock("bullmq", () => bullmq);

import { createWorker, type JobHandlers } from "../../src/lib/worker.ts";
import type { Job } from "bullmq";

const redis = { REDIS_HOST: "redis", REDIS_PORT: 6379, REDIS_USE_SSL: true };

beforeEach(() => vi.clearAllMocks());

type Processor = (job: Partial<Job>, ...args: unknown[]) => Promise<unknown>;

function create(handlers: Partial<JobHandlers<"media-light">>, opts?: object) {
	const worker = createWorker(
		"media-light",
		handlers as JobHandlers<"media-light">,
		redis,
		opts,
	) as unknown as {
		name: string;
		processor: Processor;
		opts: object;
	};
	return worker;
}

describe("createWorker", () => {
	it("creates a BullMQ worker for the queue with its options and the redis connection", () => {
		const worker = create({}, { concurrency: 8 });
		expect(worker.name).toBe("media-light");
		expect(worker.opts).toEqual({
			concurrency: 8,
			connection: { host: "redis", port: 6379, tls: {} },
		});
	});

	it("lets the redis connection win over a connection in the options", () => {
		const worker = create({}, { connection: { host: "elsewhere" } });
		expect(worker.opts).toEqual({ connection: { host: "redis", port: 6379, tls: {} } });
	});

	it("dispatches a job to the handler named like the job, with all processor args", async () => {
		const probe = vi.fn(async () => "probed");
		const thumbnail = vi.fn();
		const worker = create({ probe, thumbnail });
		const job = { name: "probe", data: { mediaId: "m" } };
		await expect(worker.processor(job, "token", "signal")).resolves.toBe("probed");
		expect(probe).toHaveBeenCalledWith(job, "token", "signal");
		expect(thumbnail).not.toHaveBeenCalled();
	});

	it("throws for a job without a handler", () => {
		const worker = create({});
		expect(() => worker.processor({ name: "nope" })).toThrow(
			'No handler for job "nope" on queue "media-light"',
		);
	});

	it("does not treat inherited object properties as handlers", () => {
		const worker = create({});
		expect(() => worker.processor({ name: "toString" })).toThrow(/No handler/);
	});
});
