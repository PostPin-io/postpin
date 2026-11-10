import { uxp } from "../host";

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
