/**
 * The text of an error thrown by a remote function. SvelteKit's HttpError keeps it in
 * `body.message`, its own `message` is undefined.
 */
export const remoteErrorMessage = (e: unknown, fallback = "Something went wrong") =>
	(e as { body?: { message?: string } })?.body?.message ?? (e as Error)?.message ?? fallback;

export const remoteErrorStatus = (e: unknown) => (e as { status?: number })?.status;
