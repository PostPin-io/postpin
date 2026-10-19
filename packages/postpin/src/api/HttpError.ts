/**
 * Throw from a controller to respond with a status other than 500. tsoa takes the status of a
 * thrown error from its `status` property; `this.setStatus()` only applies to successful responses.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}
