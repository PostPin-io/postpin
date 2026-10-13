import { auth } from "#lib/server/auth.ts";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/env";
import { sequence, type Handle } from "@sveltejs/kit/hooks";
import { handleApiRequest } from "./api";

const authHandler: Handle = async ({ event, resolve }) => {
	return svelteKitHandler({ event, resolve, auth, building });
};

const apiHandler: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith("/api/")) {
		return handleApiRequest(event);
	}

	return resolve(event);
};
const sessionHandler: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.user = (session?.user as any) ?? null;

	return resolve(event);
};
export const handle = sequence(authHandler, apiHandler, sessionHandler);
