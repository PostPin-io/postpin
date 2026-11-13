import { isHttpError } from "@sveltejs/kit";
import { authorize, type Target } from "#lib/server/org-access.ts";
import { HttpError } from "./HttpError.ts";
import type { Action, Area } from "#lib/roles.ts";

/** authorize() for controllers: turns SvelteKit errors into errors tsoa understands */
export async function apiAuthorize<A extends Area>(area: A, action: Action<A>, target: Target) {
	try {
		return await authorize(area, action, target);
	} catch (e) {
		if (isHttpError(e)) throw new HttpError(e.status, e.body.message);
		throw e;
	}
}

/** Runs SvelteKit-throwing server code (e.g. #lib/server/export-upload.ts) for a controller */
export async function apiCall<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise;
	} catch (e) {
		if (isHttpError(e)) throw new HttpError(e.status, e.body.message);
		throw e;
	}
}
