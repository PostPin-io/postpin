import type { Request as HapiRequest } from "@hapi/hapi";
import type { RequestEvent } from "@sveltejs/kit";
import { expect } from "vitest";
import { HttpError } from "../../src/api/HttpError.ts";
import { prisma } from "./db.ts";
import { currentEvent, signIn } from "./request-event.ts";

/**
 * Helpers for the REST API (tsoa + hapi). In the app, hooks.server.ts puts the user (with
 * memberships) into `event.locals`, and handleApiRequest hands that same object to hapi as
 * `request.app.locals`. Controllers read the user from there; authorize() reads it from
 * getRequestEvent(). These helpers keep both views on the same `locals`.
 */

/** signIn() with the user loaded the way hooks.server.ts loads `locals.user` (incl. memberships) */
export async function signInApi(user: { id: string }, organizationId: string | null = null) {
	const full = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: { memberships: { orderBy: { createdAt: "asc" } } },
	});
	signIn(full, organizationId);
	return full;
}

/** The hapi request as a controller sees it. Call after signIn/signInApi. */
export function hapiRequest(): HapiRequest {
	return { app: { locals: currentEvent().locals } } as unknown as HapiRequest;
}

/**
 * A SvelteKit RequestEvent whose `locals` is the object getRequestEvent() returns, so code that
 * mutates `event.locals` (hooks) and code that reads getRequestEvent() (authorize) agree.
 * Create it after signIn, since signIn replaces the locals object.
 */
export function fakeRequestEvent(path: string, init?: RequestInit) {
	const request = new Request(new URL(path, "http://localhost"), init);
	const cookies = new Map<string, string>();
	return {
		request,
		url: new URL(request.url),
		locals: currentEvent().locals,
		params: {},
		route: { id: null },
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		getClientAddress: () => "127.0.0.1",
		setHeaders: () => {},
		fetch,
		cookies: {
			get: (name: string) => cookies.get(name),
			getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string) => void cookies.set(name, value),
			delete: (name: string) => void cookies.delete(name),
			serialize: () => "",
		},
	} as unknown as RequestEvent;
}

/** Awaits `promise` and asserts it threw the API's HttpError with `status`. */
export async function expectHttpError(promise: Promise<unknown>, status: number) {
	try {
		await promise;
	} catch (e) {
		if (e instanceof HttpError) {
			expect(e.status, e.message).toBe(status);
			return e;
		}
		throw e;
	}
	expect.fail(`expected HttpError ${status}, but it resolved`);
}
