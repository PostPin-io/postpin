import { isHttpError } from "@sveltejs/kit";
import { authorize, type Target } from "#lib/server/org-access.ts";
import { HttpError, PluginRoleError } from "./HttpError.ts";
import { roleAllows, type Action, type Area } from "#lib/roles.ts";

/**
 * authorize() for controllers: turns SvelteKit errors into errors tsoa understands. The REST API is
 * the plugins' API, so it also needs the plugin right in the target's organization (not Reviewer).
 */
export async function apiAuthorize<A extends Area>(area: A, action: Action<A>, target: Target) {
	let result: Awaited<ReturnType<typeof authorize<A>>>;
	try {
		result = await authorize(area, action, target);
	} catch (e) {
		if (isHttpError(e)) throw new HttpError(e.status, e.body.message);
		throw e;
	}
	if (!roleAllows(result.member.role, "plugin", "use")) throw new PluginRoleError();
	return result;
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
