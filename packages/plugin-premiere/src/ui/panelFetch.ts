// Webview side of the API requests: a fetch that sends the request to the panel, see netWire.ts
import type { NetBridge } from "../netWire";

// statuses whose Response must not have a body
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export function createPanelFetch(net: NetBridge): typeof fetch {
	return async (input, init) => {
		const request = new Request(input, init);
		const hasBody = request.method !== "GET" && request.method !== "HEAD";
		const res = await net.fetch({
			url: request.url,
			method: request.method,
			headers: [...request.headers],
			body: hasBody ? await request.text() : undefined,
		});
		return new Response(NULL_BODY_STATUSES.has(res.status) ? null : res.body, {
			status: res.status,
			statusText: res.statusText,
			headers: res.headers,
		});
	};
}
