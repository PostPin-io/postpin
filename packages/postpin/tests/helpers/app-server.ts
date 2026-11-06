import * as v from "valibot";
import { currentEvent } from "./request-event.ts";

/**
 * Stand-in for `$app/server`. `query` / `command` become plain async functions
 * that validate their argument with the given schema, like SvelteKit does.
 */
export const getRequestEvent = () => currentEvent();

type Schema = v.GenericSchema | v.GenericSchemaAsync;

function remote(schemaOrFn: unknown, maybeFn?: unknown) {
	const fn = (maybeFn ?? schemaOrFn) as (arg?: unknown) => unknown;
	const schema = maybeFn ? (schemaOrFn as Schema | "unchecked") : undefined;
	const exec = async (arg?: unknown) => {
		if (schema && schema !== "unchecked") {
			const result = await v.safeParseAsync(schema, arg);
			if (!result.success) {
				const { error } = await import("@sveltejs/kit");
				error(400, "Bad Request");
			}
			arg = result.output;
		}
		return await fn(arg);
	};
	// Server code calls `query(...)(arg).refresh()` / `.set()` inside commands. Those are
	// client concerns, so they are no-ops here. The call runs lazily (on await), so an
	// un-awaited `getX(arg).refresh()` never starts a stray query.
	const call = (arg?: unknown) => {
		let p: Promise<unknown> | undefined;
		const run = () => (p ??= exec(arg));
		return {
			then: (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => run().then(ok, fail),
			catch: (fail?: (e: unknown) => unknown) => run().catch(fail),
			finally: (f?: () => void) => run().finally(f),
			refresh: async () => {},
			set: () => {},
		} as unknown as Promise<unknown> & { refresh: () => Promise<void>; set: (v: unknown) => void };
	};
	// SvelteKit's vite plugin checks that every export of a `.remote.ts` file carries `__.type`
	Object.defineProperty(call, "__", { value: { type: "query" } });
	return call;
}

export const query = Object.assign(remote, { batch: remote });
export const command = remote;
export const form = remote;
export const prerender = remote;
