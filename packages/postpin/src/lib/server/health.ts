import type { Handle } from "@sveltejs/kit/hooks";
import { prisma } from "#lib/server/database.ts";

/**
 * `/health` for Docker healthchecks and reverse proxies. Runs first in the hook sequence, so it
 * needs no session and never redirects to the login. Only checks the database: restarting the app
 * wouldn't fix an S3 or Redis outage.
 */
export const healthHandler: Handle = async ({ event, resolve }) => {
	if (event.url.pathname !== "/health") return resolve(event);

	const headers = { "cache-control": "no-store" };
	try {
		await prisma.$queryRaw`SELECT 1`;
		return Response.json({ status: "ok" }, { status: 200, headers });
	} catch {
		// no error details, the endpoint is public
		return Response.json({ status: "error" }, { status: 503, headers });
	}
};
