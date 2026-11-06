// @ts-check
// Dev runner for the Electron app: waits for the dev server and the first build,
// then (re)starts Electron whenever dist/*.cjs changes.
//
// Replaces `wait-on … && nodemon --exec electron .`: when `pnpm dev` was killed, that nodemon
// sometimes survived as an orphan, and every orphan started its own Electron on each rebuild.
// This runner exits as soon as its parent is gone, and kills a leftover runner on start.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import waitOn from "wait-on";

const root = path.join(import.meta.dirname, "..");
const pidFile = path.join(root, ".dev-app.pid");
const RESTART_DELAY_MS = 500;

killLeftoverRunner();
fs.writeFileSync(pidFile, String(process.pid));

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
let shuttingDown = false;

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM", "SIGHUP"])) {
	process.on(signal, () => void shutdown());
}

// Orphaned (parent killed without passing the signal on) → exit instead of living on
const parentPid = process.ppid;
setInterval(() => {
	if (process.ppid !== parentPid) void shutdown();
}, 1000).unref();

await waitOn({
	resources: [
		"tcp:localhost:5184",
		`file:${path.join(root, "dist/main.cjs")}`,
		`file:${path.join(root, "dist/preload.cjs")}`,
	],
});
if (shuttingDown) process.exit(0);

start();

// Watch the package dir, not dist itself: build.mjs deletes and recreates dist on start
/** @type {NodeJS.Timeout | undefined} */
let restartTimer;
fs.watch(root, { recursive: true }, (_event, file) => {
	if (!file || !file.startsWith(`dist${path.sep}`) || !file.endsWith(".cjs")) return;
	clearTimeout(restartTimer);
	restartTimer = setTimeout(() => void restart(), RESTART_DELAY_MS);
});

function start() {
	console.log("[dev-app] starting electron");
	const proc = spawn(/** @type {string} */ (/** @type {unknown} */ (electron)), ["."], {
		cwd: root,
		stdio: "inherit",
	});
	proc.on("exit", () => {
		if (child === proc) child = null;
	});
	child = proc;
}

async function stop() {
	const proc = child;
	child = null;
	if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
	await new Promise((resolve) => {
		proc.once("exit", resolve);
		proc.kill("SIGTERM");
		setTimeout(() => proc.kill("SIGKILL"), 3000).unref();
	});
}

let restarting = false;
async function restart() {
	if (restarting || shuttingDown) return;
	restarting = true;
	await stop();
	if (!shuttingDown) start();
	restarting = false;
}

async function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	await stop();
	try {
		if (fs.readFileSync(pidFile, "utf8") === String(process.pid)) fs.rmSync(pidFile);
	} catch {}
	process.exit(0);
}

function killLeftoverRunner() {
	try {
		const pid = Number(fs.readFileSync(pidFile, "utf8"));
		if (!pid || pid === process.pid) return;
		// The pid may belong to an unrelated process by now
		const command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
		if (command.includes("dev-app.mjs")) process.kill(pid, "SIGTERM");
	} catch {} // no file, or the process is already gone
}
