/**
 * The server's answer when the user's role doesn't include the plugins (Reviewer): the body of an
 * API error carries the error's name.
 */
export const isPluginRoleError = (err: unknown) =>
	typeof err === "object" && err !== null && "name" in err && err.name === "PluginRoleError";

// Errors come as Error from bridges, and as the response body (which carries a message)
// from API calls with throwOnError
export function errorMessage(err: unknown) {
	if (err instanceof Error) return err.message;
	if (typeof err === "object" && err && "message" in err) return String(err.message);
	return String(err);
}
