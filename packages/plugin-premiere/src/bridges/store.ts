import type { Sequence } from "@adobe/premierepro";
import { fs, os, ppro, sep, uxp } from "../host";
import { parseLabelPrefs, type LabelPrefs } from "../premiere/labels";

// JSON file in the plugin's data folder. localStorage doesn't survive a webview reload.
// Writes are queued so concurrent updates don't overwrite each other.
export function createStore<T extends object>(fileName: string, defaults: T) {
	let cache: T | null = null;
	let writes = Promise.resolve();

	async function read(): Promise<T> {
		if (cache) return cache;
		try {
			const folder = await uxp.storage.localFileSystem.getDataFolder();
			const file = await folder.getEntry(fileName);
			cache = { ...defaults, ...JSON.parse(await file.read()) };
		} catch {
			cache = { ...defaults };
		}
		return cache!;
	}

	function update(patch: Partial<T>): Promise<T> {
		const result = writes.then(async () => {
			const next = { ...(await read()), ...patch };
			cache = next;
			const folder = await uxp.storage.localFileSystem.getDataFolder();
			const file = await folder.createFile(fileName, { overwrite: true });
			await file.write(JSON.stringify(next));
			return next;
		});
		writes = result.then(
			() => {},
			() => {},
		);
		return result;
	}

	return { read, update };
}

// Secrets in the OS keychain via UXP's secureStorage, which returns Uint8Array
export async function getSecret(key: string): Promise<string | null> {
	const value: Uint8Array | null = await uxp.storage.secureStorage.getItem(key);
	return value?.length ? String.fromCharCode(...value) : null;
}
export const setSecret = (key: string, value: string) =>
	uxp.storage.secureStorage.setItem(key, value);
export const deleteSecret = (key: string) => uxp.storage.secureStorage.removeItem(key);

export async function exportSequenceXml(sequence: Sequence): Promise<string> {
	const folder = await uxp.storage.localFileSystem.getTemporaryFolder();
	const fileName = `postpin-snapshot-${Date.now()}.xml`;
	const path = `${folder.nativePath.replace(/[\\/]$/, "")}${sep}${fileName}`;

	const ok = await ppro.ProjectConverter.exportAsFinalCutProXML(sequence, path, true);
	if (!ok) throw new Error("Premiere couldn't export the sequence as Final Cut Pro XML");

	const file = await folder.getEntry(fileName);
	try {
		return await file.read();
	} finally {
		await file.delete().catch(() => {});
	}
}

// Premiere keeps the label settings in its preferences file,
// <Documents>/Adobe/Premiere Pro/<major.minor>/Profile-<user>/Adobe Premiere Pro Prefs.
// Premiere writes the file when the preferences dialog closes and when it quits.
export async function readLabelPrefs(): Promise<LabelPrefs> {
	const [major, minor] = String(uxp.host.version).split(".");
	const folder = [os.homedir(), "Documents", "Adobe", "Premiere Pro", `${major}.${minor}`].join(
		sep,
	);
	const profiles = ((await fs.readdir(folder)) as string[]).filter((name) =>
		name.startsWith("Profile-"),
	);
	if (profiles.length !== 1) {
		throw new Error(`Expected one profile in ${folder}, found ${profiles.join(", ") || "none"}`);
	}
	const path = [folder, profiles[0], "Adobe Premiere Pro Prefs"].join(sep);
	return parseLabelPrefs(await fs.readFile(path, { encoding: "utf-8" }));
}
