import Hapi from "@hapi/hapi";
import type { RequestEvent } from "@sveltejs/kit";
import { RegisterRoutes } from "./build/routes";
import { version } from "$app/env";
import { API_VERSION_HEADER, POSTPIN_API_VERSION } from "@postpin-io/shared/api-version";

declare module "@hapi/hapi" {
	interface RequestApplicationState {
		locals: App.Locals;
	}
}

// Any origin may call the API, e.g. the Resolve plugin, whose UI runs on file:// (Origin: null).
// hapi answers CORS preflight requests itself once cors is enabled for the routes.
const server = Hapi.server({
	routes: { cors: { origin: ["*"], additionalHeaders: [API_VERSION_HEADER] } },
});

// Plugins send their API version and must speak exactly the server's (see POSTPIN_API_VERSION).
// Clients without the header, e.g. scripts using the OpenAPI spec, aren't checked. onPreAuth runs
// after routing, so the 426 still carries the CORS headers the plugin needs to read it.
server.ext("onPreAuth", (request, h) => {
	const value: unknown = request.headers[API_VERSION_HEADER.toLowerCase()];
	// repeated headers arrive as an array; the first one counts
	const header = Array.isArray(value) ? value[0] : value;
	if (typeof header !== "string" || header === String(POSTPIN_API_VERSION)) return h.continue;
	const clientApiVersion = /^\d+$/.test(header) ? Number(header) : header;
	const update =
		typeof clientApiVersion === "number" && clientApiVersion > POSTPIN_API_VERSION
			? "Update the PostPin server, or install an older plugin."
			: "Update the plugin.";
	return h
		.response({
			name: "HttpError",
			message:
				`This plugin speaks API version ${header}, but the PostPin server speaks ` +
				`${POSTPIN_API_VERSION}. ${update}`,
			serverApiVersion: POSTPIN_API_VERSION,
			// the plugins of this release speak the server's API version, see releaseDownloadUrl()
			serverRelease: version,
			clientApiVersion,
		})
		.code(426)
		.takeover();
});
server.ext("onPreResponse", (request, h) => {
	const { response } = request;
	if ("isBoom" in response && response.isBoom) {
		console.error(
			`[api] ${request.method.toUpperCase()} ${request.path} -> ${response.output.statusCode}`,
			response,
		);
		// Don't leak internals (e.g. "ReferenceError: … is not defined") to clients
		if (response.output.statusCode >= 500) {
			response.output.payload = {
				statusCode: response.output.statusCode,
				error: "Internal Server Error",
				message: "Internal server error",
			};
		}
	}
	return h.continue;
});
const ready = server
	.register({
		plugin: { name: "tsoa-routes", register: RegisterRoutes },
		routes: { prefix: "/api" },
	})
	.then(() => server.initialize());

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export async function handleApiRequest(event: RequestEvent): Promise<Response> {
	await ready;

	const { request, url } = event;
	const res = await server.inject({
		method: request.method,
		url: url.pathname + url.search,
		headers: Object.fromEntries(request.headers),
		payload: request.body ? Buffer.from(await request.arrayBuffer()) : undefined,
		remoteAddress: event.getClientAddress(),
		app: { locals: event.locals },
	});

	const headers = new Headers();
	for (const [name, value] of Object.entries(res.headers)) {
		for (const v of Array.isArray(value) ? value : [value]) headers.append(name, String(v));
	}

	return new Response(
		NULL_BODY_STATUSES.has(res.statusCode) ? null : Uint8Array.from(res.rawPayload),
		{
			status: res.statusCode,
			headers,
		},
	);
}
