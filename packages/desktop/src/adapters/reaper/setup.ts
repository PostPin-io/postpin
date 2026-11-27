// Sets REAPER up for PostPin, once, while REAPER is closed (it writes its ini files on quit):
// - Scripts/PostPin/postpin_bridge.lua, the bridge script (rewritten whenever it changes),
// - an action for it in reaper-kb.ini with a fixed id, so PostPin can run it by name,
// - a second web interface in reaper.ini on a port of PostPin's own, with a password, which
//   runs the action and answers PostPin. The user's own web interfaces stay as they are.
// Checked with REAPER 7.86 on macOS.

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Store from "electron-store";
import {
	hasAction,
	hasWebInterface,
	SCRIPT_PATH,
	withAction,
	withWebInterface,
	type Endpoint,
} from "./ini";
import BRIDGE_SCRIPT from "./postpin_bridge.lua";

const run = promisify(execFile);

export { ACTION_ID, type Endpoint } from "./ini";

export class ReaperError extends Error {}

const store = new Store<{ endpoint?: Endpoint }>({ name: "reaper" });

/** REAPER's resource folder; REAPER_RESOURCE_PATH overrides it (portable installs) */
export function resourcePath(): string {
	if (process.env.REAPER_RESOURCE_PATH) return process.env.REAPER_RESOURCE_PATH;
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library/Application Support/REAPER");
	}
	if (process.platform === "win32") {
		return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData/Roaming"), "REAPER");
	}
	return path.join(os.homedir(), ".config/REAPER");
}

export async function isReaperRunning(): Promise<boolean> {
	try {
		if (process.platform === "win32") {
			const { stdout } = await run("tasklist", ["/FI", "IMAGENAME eq reaper.exe", "/NH"]);
			return stdout.toLowerCase().includes("reaper.exe");
		}
		await run("pgrep", ["-x", process.platform === "darwin" ? "REAPER" : "reaper"]);
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

const readIni = async (file: string) => (existsSync(file) ? readFile(file, "latin1") : null);

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

async function writeScript(base: string) {
	const file = path.join(base, "Scripts", SCRIPT_PATH);
	const current = existsSync(file) ? await readFile(file, "utf8") : null;
	if (current === BRIDGE_SCRIPT) return;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, BRIDGE_SCRIPT, "utf8");
}

/**
 * Where PostPin reaches REAPER. Sets REAPER up first when it isn't; that needs REAPER closed,
 * otherwise it throws and asks for it.
 */
export async function ensureSetUp(): Promise<Endpoint> {
	const base = resourcePath();
	const iniFile = path.join(base, "reaper.ini");
	const kbFile = path.join(base, "reaper-kb.ini");
	const ini = await readIni(iniFile);
	if (ini === null) {
		throw new ReaperError(
			"REAPER isn't set up on this computer yet. Start REAPER once, quit it, then try again.",
		);
	}
	// the script may change with every PostPin update, REAPER reads it on every run
	await writeScript(base);

	const saved = store.get("endpoint");
	const kb = (await readIni(kbFile)) ?? "";
	if (saved && hasWebInterface(ini, saved) && hasAction(kb)) return saved;

	if (await isReaperRunning()) {
		throw new ReaperError("PostPin needs to set up REAPER once. Quit REAPER, then start it again.");
	}
	const endpoint = saved ?? { port: await freePort(), password: randomBytes(18).toString("hex") };
	await writeFile(iniFile, withWebInterface(ini, endpoint), "latin1");
	await writeFile(kbFile, withAction(kb), "latin1");
	store.set("endpoint", endpoint);
	return endpoint;
}
