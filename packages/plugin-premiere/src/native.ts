// The native addon (native/, Rust): starts processes, which UXP alone can't. Missing when the addon
// doesn't load (Premiere before 26.2, a blocked signature, a missing file); then Premiere doesn't
// encode and the server does.
declare const require: (id: string) => unknown;

export interface ProcessOutput {
	stdout: string;
	stderr: string;
	running: boolean;
	exitCode: number | null;
	signal: number | null;
}

export interface ProcessAddon {
	/** starts a process, returns its handle; throws when it can't start */
	spawn(path: string, args: string[]): number;
	/** what it wrote since the last call; never blocks. The handle is gone once running is false. */
	poll(handle: number): ProcessOutput;
	/** SIGTERM, or SIGKILL with force (Windows: always ends it) */
	kill(handle: number, force?: boolean): boolean;
	/** chmod +x on macOS (a .ccx is a zip and may lose the bit), nothing on Windows */
	ensureExecutable(path: string): void;
}

let loading: Promise<ProcessAddon | null> | null = null;

/** Loads the addon once; null when it can't be loaded */
export function loadAddon() {
	return (loading ??= (async () => {
		try {
			// UXP resolves the name through manifest.json's "addon" and mac/<arch>/ or win/x64/
			return (await require("postpin-process.uxpaddon")) as ProcessAddon;
		} catch (error) {
			console.warn("[PostPin] native addon unavailable, the server encodes:", error);
			return null;
		}
	})());
}

const POLL_MS = 250;

export interface RunResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

/**
 * Runs `path` to its end through the addon, polling every 250 ms. `onStdout` gets every chunk.
 * Rejects with the first line ffmpeg wrote to stderr when it fails.
 */
export function runProcess(
	addon: ProcessAddon,
	path: string,
	args: string[],
	{ onStdout, signal }: { onStdout?: (chunk: string) => void; signal?: AbortSignal } = {},
) {
	return new Promise<RunResult>((resolve, reject) => {
		let handle: number;
		try {
			handle = addon.spawn(path, args);
		} catch (error) {
			reject(error);
			return;
		}
		let stdout = "";
		let stderr = "";
		signal?.addEventListener("abort", () => addon.kill(handle, true), { once: true });
		const tick = () => {
			let out: ProcessOutput;
			try {
				out = addon.poll(handle);
			} catch (error) {
				reject(error);
				return;
			}
			if (out.stdout) {
				stdout += out.stdout;
				onStdout?.(out.stdout);
			}
			stderr += out.stderr;
			if (out.running) {
				setTimeout(tick, POLL_MS);
				return;
			}
			if (signal?.aborted) {
				reject(new Error("Cancelled"));
				return;
			}
			// both null: the host reaped the child and its status is lost (see native/src/process.rs);
			// callers check their results themselves then
			if (out.exitCode === 0 || (out.exitCode === null && out.signal === null)) {
				resolve({ stdout, stderr, exitCode: out.exitCode });
			} else {
				const name = path.split(/[\\/]/).pop();
				const cause = stderr.trim().split("\n")[0] ?? "";
				reject(new Error(`${name} failed (${out.signal ?? out.exitCode}): ${cause}`));
			}
		};
		tick();
	});
}
