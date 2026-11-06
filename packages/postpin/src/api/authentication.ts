import type { Request } from "@hapi/hapi";
import { HttpError } from "./HttpError.ts";

/** Called by the generated routes for every operation with @Security */
export async function hapiAuthentication(
	request: Request,
	securityName: string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_scopes?: string[],
) {
	if (securityName !== "session")
		throw new HttpError(500, `Unknown security scheme: ${securityName}`);
	const { user, session } = request.app.locals;
	if (!user || !session) throw new HttpError(401, "Not signed in");
	return user;
}
