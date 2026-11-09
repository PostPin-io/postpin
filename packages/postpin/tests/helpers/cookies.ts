import type { Cookies } from "@sveltejs/kit";

/** Cookie jar for server code that takes SvelteKit's `cookies`; keeps the options for assertions. */
export function fakeCookies() {
	const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
	const cookies = {
		get: (name: string) => jar.get(name)?.value,
		set: (name: string, value: string, opts: Record<string, unknown>) =>
			void jar.set(name, { value, opts }),
		delete: (name: string) => void jar.delete(name),
		getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
		serialize: () => "",
	} as unknown as Cookies;
	return { jar, cookies };
}

export type FakeCookies = ReturnType<typeof fakeCookies>["cookies"];
