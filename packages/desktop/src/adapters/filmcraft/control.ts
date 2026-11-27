// FilmCraft's desktop control channel (docs/control-protocol.md): JSON lines over TCP on
// loopback, every request carrying FILMCRAFT_CONTROL_TOKEN.
//
// FilmCraft only opens the channel when it was started with `--control <port>` and the token in
// its environment, and it has no setting or port file for it. So PostPin starts FilmCraft itself
// with a fresh token and remembers port and token for later runs. FILMCRAFT_CONTROL_PORT and
// FILMCRAFT_CONTROL_TOKEN in PostPin's own environment override that (for development, when both
// apps are started from one shell).

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Store from "electron-store";

const run = promisify(execFile);

interface Endpoint {
	port: number;
	token: string;
}

const store = new Store<{ endpoint?: Endpoint }>({ name: "filmcraft" });

const REQUEST_TIMEOUT_MS = 60_000;
const LAUNCH_TIMEOUT_MS = 30_000;

export class FilmCraftError extends Error {}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout;
}

class Connection {
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, Pending>();
	closed = false;

	private constructor(
		private socket: net.Socket,
		private token: string,
	) {
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => this.onData(chunk));
		socket.on("close", () => this.fail(new FilmCraftError("The connection to FilmCraft closed")));
		socket.on("error", (err) => this.fail(err));
	}

	static open({ port, token }: Endpoint): Promise<Connection> {
		return new Promise((resolve, reject) => {
			const socket = net.connect({ host: "127.0.0.1", port });
			const onError = (err: Error) => {
				socket.destroy();
				reject(err);
			};
			socket.once("error", onError);
			socket.once("connect", () => {
				socket.off("error", onError);
				resolve(new Connection(socket, token));
			});
		});
	}

	request(method: string, params?: unknown): Promise<unknown> {
		if (this.closed) return Promise.reject(new FilmCraftError("Not connected to FilmCraft"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new FilmCraftError(`FilmCraft didn't answer ${method} in time`));
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			this.socket.write(`${JSON.stringify({ id, token: this.token, method, params })}\n`);
		});
	}

	close() {
		this.socket.destroy();
	}

	private onData(chunk: string) {
		this.buffer += chunk;
		let newline: number;
		while ((newline = this.buffer.indexOf("\n")) >= 0) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (line) this.onLine(line);
		}
	}

	private onLine(line: string) {
		let reply: { id?: number; ok?: boolean; result?: unknown; error?: unknown };
		try {
			reply = JSON.parse(line);
		} catch {
			return;
		}
		// errors that close the connection (a bad token) come without our id
		const id = typeof reply.id === "number" ? reply.id : [...this.pending.keys()][0];
		const pending = id === undefined ? undefined : this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id!);
		clearTimeout(pending.timer);
		if (reply.ok) pending.resolve(reply.result);
		else pending.reject(new FilmCraftError(`FilmCraft: ${String(reply.error ?? "unknown error")}`));
	}

	private fail(err: Error) {
		this.closed = true;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(err instanceof FilmCraftError ? err : new FilmCraftError(err.message));
		}
		this.pending.clear();
	}
}

// ---------------------------------------------------------------------------------------------
// Finding and starting FilmCraft
// ---------------------------------------------------------------------------------------------

const MAC_BUNDLE_ID = "ai.storyteller.filmcraft";

/** FilmCraft's executable, null when it isn't installed where we look */
async function findExecutable(): Promise<string | null> {
	if (process.env.FILMCRAFT_APP) return process.env.FILMCRAFT_APP;
	if (process.platform === "darwin") {
		const candidates = [
			"/Applications/FilmCraft.app",
			path.join(os.homedir(), "Applications/FilmCraft.app"),
		];
		try {
			const { stdout } = await run("mdfind", [`kMDItemCFBundleIdentifier == "${MAC_BUNDLE_ID}"`]);
			candidates.push(...stdout.split("\n").filter((line) => line.endsWith(".app")));
		} catch {
			// Spotlight off, the fixed paths remain
		}
		for (const app of candidates) {
			if (!existsSync(app)) continue;
			let name = "filmcraft";
			try {
				const { stdout } = await run("defaults", [
					"read",
					path.join(app, "Contents/Info"),
					"CFBundleExecutable",
				]);
				name = stdout.trim() || name;
			} catch {
				// keep the default name
			}
			const executable = path.join(app, "Contents/MacOS", name);
			if (existsSync(executable)) return executable;
		}
		return null;
	}
	if (process.platform === "win32") {
		const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData/Local");
		const executable = path.join(local, "Programs/ArtCraft/FilmCraft/filmcraft.exe");
		return existsSync(executable) ? executable : null;
	}
	return existsSync("/usr/bin/filmcraft") ? "/usr/bin/filmcraft" : null;
}

async function isRunning(executable: string): Promise<boolean> {
	const name = path.basename(executable);
	try {
		if (process.platform === "win32") {
			const { stdout } = await run("tasklist", ["/FI", `IMAGENAME eq ${name}`, "/NH"]);
			return stdout.toLowerCase().includes(name.toLowerCase());
		}
		await run("pgrep", ["-x", name]);
		return true;
	} catch {
		return false;
	}
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

// The token goes through the environment only, never the command line (docs/control-protocol.md)
async function launch(executable: string): Promise<Endpoint> {
	const endpoint = { port: await freePort(), token: randomBytes(32).toString("hex") };
	const child = spawn(executable, ["--control", String(endpoint.port)], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, FILMCRAFT_CONTROL_TOKEN: endpoint.token },
	});
	child.unref();
	store.set("endpoint", endpoint);
	return endpoint;
}

async function waitForConnection(endpoint: Endpoint): Promise<Connection> {
	const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
	for (;;) {
		try {
			return await verified(endpoint);
		} catch (err) {
			if (Date.now() > deadline) throw err;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
}

/** A connection whose token FilmCraft accepted */
async function verified(endpoint: Endpoint): Promise<Connection> {
	const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
	for (;;) {
		const connection = await Connection.open(endpoint);
		try {
			await connection.request("engine.execute", { command: "project.inspect", params: {} });
			return connection;
		} catch (err) {
			connection.close();
			// FilmCraft answers this while it loads, with the listener already open
			const starting = err instanceof Error && err.message.includes("still starting");
			if (!starting || Date.now() > deadline) throw err;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
}

function envEndpoint(): Endpoint | null {
	const port = Number(process.env.FILMCRAFT_CONTROL_PORT);
	const token = process.env.FILMCRAFT_CONTROL_TOKEN;
	return Number.isInteger(port) && port > 0 && token ? { port, token } : null;
}

async function connect(): Promise<Connection> {
	const fromEnv = envEndpoint();
	if (fromEnv) return verified(fromEnv);

	const saved = store.get("endpoint");
	if (saved) {
		try {
			return await verified(saved);
		} catch {
			// FilmCraft quit or was started without PostPin since
		}
	}

	const executable = await findExecutable();
	if (!executable) {
		throw new FilmCraftError(
			"FilmCraft isn't installed. Install it from getartcraft.com, or set FILMCRAFT_APP to its executable.",
		);
	}
	if (await isRunning(executable)) {
		throw new FilmCraftError(
			"FilmCraft is running without remote control. Quit FilmCraft, then PostPin starts it with remote control.",
		);
	}
	return waitForConnection(await launch(executable));
}

// ---------------------------------------------------------------------------------------------
// Shared client
// ---------------------------------------------------------------------------------------------

let connection: Connection | null = null;
// Concurrent first calls share one connect (and so one launch)
let connecting: Promise<Connection> | null = null;

async function getConnection(): Promise<Connection> {
	if (connection && !connection.closed) return connection;
	connecting ??= connect()
		.then((opened) => (connection = opened))
		.finally(() => {
			connecting = null;
		});
	return connecting;
}

/** Runs an engine command (`engine.execute`) and returns its result */
export async function execute<T = unknown>(command: string, params: object = {}): Promise<T> {
	const conn = await getConnection();
	return (await conn.request("engine.execute", { command, params })) as T;
}
