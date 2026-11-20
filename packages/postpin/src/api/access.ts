import { isHttpError } from "@sveltejs/kit";
import { authorize, roleAt, type Target } from "#lib/server/org-access.ts";
import { HttpError, PluginRoleError } from "./HttpError.ts";
import { roleAllows, type Action, type Area } from "#lib/roles.ts";

/**
 * The REST API is the plugins' API, and the plugins need the plugin right in the target's
 * organization (not Reviewer). A reviewer learns that the role is the reason: on what they may
 * read, and instead of a bare "Not allowed" on what they may see but not do (e.g. uploading).
 * Targets they can't reach at all stay 404, so the API doesn't reveal that they exist.
 */
export async function apiAuthorize<A extends Area>(area: A, action: Action<A>, target: Target) {
	const result = await apiPluginCall(target, authorize(area, action, target));
	if (!roleAllows(result.member.role, "plugin", "use")) throw new PluginRoleError();
	return result;
}

/**
 * apiCall() for server code that authorizes on its own (#lib/server/export-upload.ts): a 403 for a
 * role without the plugin right becomes the PluginRoleError. Such code never succeeds for those
 * roles (uploading needs Member too), so only its refusal needs translating.
 */
export async function apiPluginCall<T>(target: Target, promise: Promise<T>): Promise<T> {
	try {
		return await apiCall(promise);
	} catch (e) {
		if (e instanceof HttpError && e.status === 403) {
			const role = await apiCall(roleAt(target));
			if (role && !roleAllows(role, "plugin", "use")) throw new PluginRoleError();
		}
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
