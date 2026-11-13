import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { prisma, resetMocks } from "./handlers/mocks.ts";

vi.mock("../src/lib/worker.ts", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		createWorker: vi.fn((name: string, handlers: object, env: object, opts: object) =>
			Object.assign(new EventEmitter(), { name, handlers, env, opts }),
		),
	};
});
vi.mock("../src/lib/queue.ts", () => ({
	heavyHandlers: { heavy: true },
	lightHandlers: { light: true },
	maintenanceHandlers: { maintenance: true },
}));
// The real getQueue would connect to Redis
const maintenanceQueue = vi.hoisted(() => ({
	upsertJobScheduler: vi.fn(async () => {}),
	close: vi.fn(async () => {}),
}));
vi.mock("@postpin-io/shared/queue", async (importOriginal) => ({
	...(await importOriginal<typeof import("@postpin-io/shared/queue")>()),
	getQueue: vi.fn(() => maintenanceQueue),
}));
vi.mock("../src/lib/database.ts", async () => (await import("./handlers/mocks.ts")).database);
vi.mock("../src/lib/env.ts", async () => (await import("./handlers/mocks.ts")).env);
const storeImageSizes = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../src/lib/image-sizes.ts", () => ({ storeImageSizes }));
// Keep the real signal handlers out of the test process
vi.mock("../src/lib/shutdown.ts", () => ({
	registerShutdown: vi.fn(),
	SHUTDOWN_TIMEOUT_MS: 25_000,
}));

import { heavyWorker, lightWorker, maintenanceWorker } from "../src/index.ts";
import { registerShutdown } from "../src/lib/shutdown.ts";

// Captured before beforeEach clears all mocks
const shutdownOptions = vi.mocked(registerShutdown).mock.calls[0]?.[0];
const schedulerCalls = [...maintenanceQueue.upsertJobScheduler.mock.calls];

type FakeWorker = EventEmitter & { name: string; handlers: object; opts: object };
const light = lightWorker as unknown as FakeWorker;
const heavy = heavyWorker as unknown as FakeWorker;

/** Runs the "failed" listeners and waits for them */
const fail = (job: unknown) =>
	Promise.all(light.listeners("failed").map((listener) => listener(job, new Error())));

beforeEach(() => resetMocks());

describe("worker entry", () => {
	it("starts one worker per queue with its handlers and concurrency", () => {
		expect(heavy).toMatchObject({
			name: "media-heavy",
			handlers: { heavy: true },
			opts: { concurrency: 1 },
		});
		expect(light).toMatchObject({
			name: "media-light",
			handlers: { light: true },
			opts: { concurrency: 8 },
		});
		expect(maintenanceWorker).toMatchObject({
			name: "maintenance",
			handlers: { maintenance: true },
			opts: { concurrency: 1 },
		});
	});

	it("schedules the cleanup once a day under a fixed id, so restarts don't add more", () => {
		expect(schedulerCalls).toEqual([
			[
				"cleanup-daily",
				{ pattern: "0 3 * * *", tz: "Europe/Berlin" },
				expect.objectContaining({ name: "cleanup", data: {} }),
			],
		]);
	});

	it("marks the media as failed when its setMediaProcessingDone job fails", async () => {
		await fail({ name: "setMediaProcessingDone", data: { mediaId: "m1" } });
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { status: "FAILED" },
		});
		expect(storeImageSizes).toHaveBeenCalledWith("m1");
	});

	it("ignores failures of other jobs and failures without a job", async () => {
		await fail({ name: "probe", data: { mediaId: "m1" } });
		await fail(undefined);
		expect(prisma.media.update).not.toHaveBeenCalled();
		expect(storeImageSizes).not.toHaveBeenCalled();
	});

	it("shuts all workers down gracefully on SIGTERM", () => {
		expect(shutdownOptions).toMatchObject({
			workers: [heavyWorker, lightWorker, maintenanceWorker],
			timeoutMs: 25_000,
		});
	});

	it("closes the maintenance queue and the database on shutdown", async () => {
		await shutdownOptions?.cleanup?.();
		expect(maintenanceQueue.close).toHaveBeenCalled();
		expect(prisma.$disconnect).toHaveBeenCalled();
	});
});
