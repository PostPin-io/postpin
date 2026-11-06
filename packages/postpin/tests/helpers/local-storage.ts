import { vi } from "vitest";

/** In-memory localStorage. `blocked: true` makes every access throw, like a locked-down private window. */
export function stubLocalStorage({ blocked = false } = {}) {
	const data = new Map<string, string>();
	const guard = () => {
		if (blocked) throw new DOMException("The operation is insecure.", "SecurityError");
	};
	const storage = {
		getItem: (k: string) => (guard(), data.get(k) ?? null),
		setItem: (k: string, v: string) => (guard(), void data.set(k, String(v))),
		removeItem: (k: string) => (guard(), void data.delete(k)),
		clear: () => (guard(), data.clear()),
		key: (i: number) => [...data.keys()][i] ?? null,
		get length() {
			return data.size;
		},
	};
	vi.stubGlobal("localStorage", storage);
	return data;
}
