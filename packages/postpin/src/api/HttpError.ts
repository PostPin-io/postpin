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

/**
 * The user's role in the organization doesn't include the plugins (Reviewer). Its own name, so the
 * plugins can tell it apart in the response body ({ name, message }) and show it as such.
 */
export class PluginRoleError extends HttpError {
	constructor() {
		super(403, PLUGIN_ROLE_MESSAGE);
		this.name = "PluginRoleError";
	}
}

export const PLUGIN_ROLE_MESSAGE =
	"PostPin plugins need the Member role. You're a Reviewer here, and reviewers can't upload exports or change other people's markers, which is what the plugins do. Ask an admin of your organization to change your role, or review in the browser.";
