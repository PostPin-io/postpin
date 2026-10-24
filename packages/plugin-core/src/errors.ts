// Errors come as Error from bridges, and as the response body (which carries a message)
// from API calls with throwOnError
export function errorMessage(err: unknown) {
	if (err instanceof Error) return err.message;
	if (typeof err === "object" && err && "message" in err) return String(err.message);
	return String(err);
}
