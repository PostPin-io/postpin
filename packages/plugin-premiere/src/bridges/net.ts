// Panel side of the webview's API requests, see netWire.ts
import type { NetBridge, WireRequest, WireResponse } from "../netWire";
import { getServerUrl } from "./auth";

export function createNetBridge(): NetBridge {
	return {
		async fetch(request: WireRequest): Promise<WireResponse> {
			// only the PostPin server, the webview has no business fetching anything else
			const serverUrl = await getServerUrl();
			if (!request.url.startsWith(`${serverUrl}/`)) {
				throw new Error(`Request outside the PostPin server: ${request.url}`);
			}
			const res = await fetch(request.url, {
				method: request.method,
				headers: Object.fromEntries(request.headers),
				body: request.body,
			});
			const headers: [string, string][] = [];
			res.headers.forEach((value, key) => headers.push([key, value]));
			return { status: res.status, statusText: res.statusText, headers, body: await res.text() };
		},
	};
}
