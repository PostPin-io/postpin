/**
 * Graceful shutdown on SIGTERM/SIGINT (`docker stop`, Watchtower updates, Ctrl+C).
 *
 * The workers stop taking new jobs and get `timeoutMs` to finish the active ones. Jobs still
 * running after that are abandoned: BullMQ's stalled-job check moves them back to the queue, so
 * another worker retries them from the start. A second signal exits immediately.
 *
 * The timeout must stay below the container's stop timeout (`stop_grace_period` in
 * deploy/compose.yml), otherwise Docker kills the process before it could close cleanly.
 */

/** The part of a BullMQ Worker this needs */
export interface ClosableWorker {
	name: string;
	close(force?: boolean): Promise<void>;
}

export interface ShutdownOptions {
	workers: ClosableWorker[];
	/** How long active jobs may keep running after the signal */
	timeoutMs: number;
	/** Runs after the workers closed, e.g. to disconnect from the database */
	cleanup?: () => Promise<unknown>;
	log?: (message: string) => void;
	exit?: (code: number) => void;
}

export const SHUTDOWN_TIMEOUT_MS = 25_000;

/** Returns the signal handler; `registerShutdown` installs it */
export function createShutdownHandler({
	workers,
	timeoutMs,
	cleanup,
	log = console.log,
	exit = (code) => process.exit(code),
}: ShutdownOptions) {
	let shuttingDown = false;

	return async (signal: string) => {
		if (shuttingDown) {
			log(`Received ${signal} again, exiting immediately`);
			exit(1);
			return;
		}
		shuttingDown = true;
		log(`Received ${signal}, waiting up to ${timeoutMs / 1000}s for active jobs`);

		let timer: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), timeoutMs);
		});
		const closed = Promise.all(workers.map((w) => w.close())).then(() => "closed" as const);

		let code = 0;
		try {
			if ((await Promise.race([closed, timedOut])) === "timeout") {
				log("Active jobs didn't finish in time; they will be retried after the restart");
				await Promise.all(workers.map((w) => w.close(true)));
			}
			await cleanup?.();
			log("Worker stopped");
		} catch (error) {
			log(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
			code = 1;
		} finally {
			clearTimeout(timer);
		}
		exit(code);
	};
}

export function registerShutdown(options: ShutdownOptions) {
	const handler = createShutdownHandler(options);
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.on(signal, () => void handler(signal));
	}
	return handler;
}
