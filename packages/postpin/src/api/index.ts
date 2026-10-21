import Hapi from "@hapi/hapi";
import type { RequestEvent } from "@sveltejs/kit";
import { RegisterRoutes } from "./build/routes";

declare module "@hapi/hapi" {
	interface RequestApplicationState {
		locals: App.Locals;
	}
}

// Any origin may call the API, e.g. the Resolve plugin, whose UI runs on file:// (Origin: null).
// hapi answers CORS preflight requests itself once cors is enabled for the routes.
const server = Hapi.server({
	routes: { cors: { origin: ["*"] } },
});
server.ext("onPreResponse", (request, h) => {
	const { response } = request;
	if ("isBoom" in response && response.isBoom) {
		console.error(
			`[api] ${request.method.toUpperCase()} ${request.path} -> ${response.output.statusCode}`,
			response,
		);
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
