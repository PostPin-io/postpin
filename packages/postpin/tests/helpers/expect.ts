import { isHttpError } from "@sveltejs/kit";
import { expect } from "vitest";

/** Awaits `promise` and asserts it threw SvelteKit's `error(status)`. */
export async function expectStatus(promise: Promise<unknown>, status: number) {
	try {
		await promise;
	} catch (e) {
		if (isHttpError(e)) {
			expect(e.status, e.body?.message).toBe(status);
			return e;
		}
		throw e;
	}
	expect.fail(`expected HTTP ${status}, but it resolved`);
}
