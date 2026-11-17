import type { RequestHandler } from "./$types";
import { liveChannel } from "@postpin-io/shared/live";
import { readExport, requireMarkers } from "#lib/server/review-access.ts";
import { liveHub, type StreamEvent } from "#lib/server/live.ts";

const HEARTBEAT_MS = 25_000;
/** Reconnecting re-checks access, so revoked members / links don't stay subscribed for long */
const MAX_LIFETIME_MS = 30 * 60_000;

/**
 * Public path (see hooks.server.ts): access is checked here, the same way as getMarkers.
 * `?share=<token>` = as guest, who only hears about their own markers (multi-tab).
 */
export const GET: RequestHandler = async ({ params, url, request }) => {
	const exportId = params.export;
	const shareToken = url.searchParams.get("share") ?? undefined;
	const reader = await readExport(exportId, shareToken);
	requireMarkers(reader);

	let channels: string[];
	let lifetime = MAX_LIFETIME_MS;
	if (reader.kind === "guest") {
		channels = [liveChannel.guest(reader.guest.id)];
		const expiresAt = reader.link.expiresAt; // null = never expires
		if (expiresAt) lifetime = Math.min(lifetime, Math.max(0, expiresAt.getTime() - Date.now()));
	} else {
		channels = [liveChannel.export(exportId)];
		if (reader.target.projectId) channels.push(liveChannel.project(reader.target.projectId));
	}

	const encoder = new TextEncoder();
	let close = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const send = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};

			const unsubscribe = liveHub.subscribe(channels, (event: StreamEvent) =>
				send(`data: ${JSON.stringify(event)}\n\n`),
			);
			const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
			const timeout = setTimeout(() => close(), lifetime);

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				clearTimeout(timeout);
				unsubscribe();
				try {
					controller.close();
				} catch {
					/* already closed by the client */
				}
			};
			request.signal.addEventListener("abort", () => close());

			// Reconnect delay for EventSource, then a first frame so proxies flush the headers
			send("retry: 3000\n\n");
		},
		cancel() {
			close();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			// nginx: don't buffer the stream
			"X-Accel-Buffering": "no",
		},
	});
};
