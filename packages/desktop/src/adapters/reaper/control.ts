// Runs bridge commands in REAPER (see postpin_bridge.lua and setup.ts). A request is a JSON file;
// one HTTP request to PostPin's web interface puts its path into ExtState and runs the bridge
// action, which writes the answer next to it. REAPER answers only when the action is done.
//
// REAPER does one thing at a time and the request slot in ExtState is shared, so commands run
// one after another. While REAPER renders it can't answer anything else; other commands fail at
// once then instead of queueing behind the render (the UI asks again later).

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ACTION_ID, ensureSetUp, isReaperRunning, ReaperError, type Endpoint } from "./setup";

export { ReaperError };

const TIMEOUT_MS = 15_000;
/** A render has no time limit of its own; this only catches a REAPER that hangs */
const RENDER_TIMEOUT_MS = 6 * 60 * 60_000;

const NOT_ANSWERING =
	"REAPER doesn't answer. Close any open window in REAPER, like the render window or the evaluation reminder, then try again.";

let queue: Promise<unknown> = Promise.resolve();
let rendering = false;
// Set up and answered once: the ini files needn't be checked again until something fails
let reached: Endpoint | null = null;

async function send(endpoint: Endpoint, file: string, timeoutMs: number) {
	const hexPath = Buffer.from(file, "utf8").toString("hex");
	const url = `http://127.0.0.1:${endpoint.port}/_/SET/EXTSTATE/postpin_bridge/req/${hexPath};_${ACTION_ID}`;
	const auth = Buffer.from(`postpin:${endpoint.password}`).toString("base64");
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Authorization: `Basic ${auth}` },
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (err) {
		if (err instanceof Error && err.name === "TimeoutError") throw new ReaperError(NOT_ANSWERING);
		const refused = (err as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED";
		if (refused && !(await isReaperRunning())) throw new ReaperError("REAPER is not running");
		if (refused) {
			throw new ReaperError(
				"REAPER doesn't let PostPin in yet. Quit REAPER and start it again, so it takes PostPin's settings.",
			);
		}
		throw err;
	}
	await response.arrayBuffer();
	if (response.status === 401) {
		throw new ReaperError("REAPER has other PostPin settings. Quit REAPER and start it again.");
	}
	if (!response.ok) throw new ReaperError(`REAPER answered with HTTP ${response.status}`);
}

async function runCommand<T>(command: string, params: unknown, timeoutMs: number): Promise<T> {
	const endpoint = reached ?? (await ensureSetUp());
	const dir = path.join(os.tmpdir(), "postpin-reaper");
	await mkdir(dir, { recursive: true });
	const file = path.join(dir, `${randomUUID()}.json`);
	await writeFile(file, JSON.stringify({ command, params: params ?? null }), "utf8");
	try {
		reached = null;
		await send(endpoint, file, timeoutMs);
		if (!existsSync(`${file}.out`)) {
			// REAPER knows no action with that id: it was started before PostPin set it up
			throw new ReaperError("REAPER didn't run PostPin's script. Quit REAPER and start it again.");
		}
		reached = endpoint;
		const answer = JSON.parse(await readFile(`${file}.out`, "utf8")) as
			{ ok: true; result: T } | { ok: false; error: string };
		if (!answer.ok) throw new ReaperError(`REAPER: ${answer.error}`);
		return answer.result;
	} finally {
		await rm(file, { force: true });
		await rm(`${file}.out`, { force: true });
	}
}

/** Runs a bridge command and returns its result */
export function execute<T = unknown>(command: string, params?: unknown): Promise<T> {
	if (rendering) return Promise.reject(new ReaperError("REAPER is rendering"));
	const result = queue.then(() => runCommand<T>(command, params, TIMEOUT_MS));
	queue = result.catch(() => {});
	return result;
}

/** Runs the render command; REAPER answers when the file is done */
export function executeRender<T = unknown>(params: unknown): Promise<T> {
	if (rendering) return Promise.reject(new ReaperError("REAPER is already rendering"));
	rendering = true;
	const result = queue
		.then(() => runCommand<T>("render", params, RENDER_TIMEOUT_MS))
		.finally(() => {
			rendering = false;
		});
	queue = result.catch(() => {});
	return result;
}
