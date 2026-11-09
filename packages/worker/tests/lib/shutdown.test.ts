import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdownHandler, type ClosableWorker } from "../../src/lib/shutdown.ts";

/** A worker whose graceful close() resolves only when `finish()` is called */
function fakeWorker(name: string) {
	let finish!: () => void;
	const activeJobsDone = new Promise<void>((resolve) => (finish = resolve));
	const worker = {
		name,
		close: vi.fn((force?: boolean) => (force ? Promise.resolve() : activeJobsDone)),
	} satisfies ClosableWorker;
	return { worker, finish };
}

const log = vi.fn();
const exit = vi.fn();
const cleanup = vi.fn(async () => {});

beforeEach(() => {
	vi.useFakeTimers();
	log.mockReset();
	exit.mockReset();
	cleanup.mockClear();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("createShutdownHandler", () => {
	it("waits for active jobs, cleans up and exits with 0", async () => {
		const a = fakeWorker("a");
		const b = fakeWorker("b");
		const handler = createShutdownHandler({
			workers: [a.worker, b.worker],
			timeoutMs: 25_000,
			cleanup,
			log,
			exit,
		});

		const done = handler("SIGTERM");
		expect(a.worker.close).toHaveBeenCalledWith();
		expect(b.worker.close).toHaveBeenCalledWith();

		await vi.advanceTimersByTimeAsync(10_000);
		expect(exit).not.toHaveBeenCalled();

		a.finish();
		b.finish();
		await done;

		expect(a.worker.close).not.toHaveBeenCalledWith(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("force-closes the workers when active jobs outlast the timeout", async () => {
		const a = fakeWorker("a");
		const handler = createShutdownHandler({
			workers: [a.worker],
			timeoutMs: 25_000,
			cleanup,
			log,
			exit,
		});

		const done = handler("SIGTERM");
		await vi.advanceTimersByTimeAsync(25_000);
		await done;

		expect(a.worker.close).toHaveBeenCalledWith(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith(0);
		expect(log).toHaveBeenCalledWith(expect.stringMatching(/retried/));
	});

	it("exits immediately with 1 on a second signal", async () => {
		const a = fakeWorker("a");
		const handler = createShutdownHandler({ workers: [a.worker], timeoutMs: 25_000, log, exit });

		void handler("SIGTERM");
		await handler("SIGINT");

		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("exits with 1 when closing fails", async () => {
		const handler = createShutdownHandler({
			workers: [{ name: "a", close: vi.fn(async () => Promise.reject(new Error("redis gone"))) }],
			timeoutMs: 25_000,
			log,
			exit,
		});

		await handler("SIGTERM");

		expect(exit).toHaveBeenCalledWith(1);
		expect(log).toHaveBeenCalledWith(expect.stringMatching(/redis gone/));
	});
});
