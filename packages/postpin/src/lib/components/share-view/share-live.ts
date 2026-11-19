import type { ScreeningMessage } from "#lib/components/screening/screening-live.ts";

/** The link no longer lets this guest in: deleted, expired, or the guest's cookie is gone */
const GONE_STATUSES = [401, 404, 410];
/** The server was unreachable or failed (a deploy, a restart): try again after this long */
export const SHARE_RETRY_MS = 5_000;

export type ShareLinkHandlers = {
	/** A screening link's playhead (see ScreeningFollower) */
	screening?: (message: ScreeningMessage) => void;
	/** (Re)connected: the current state is on its way */
	open?: () => void;
	/** The link was deleted or no longer lets this guest in */
	gone: () => void;
};

/**
 * A guest's line to their share link (/live/shares/[token]). Says at once when the link is
 * deleted; when the stream can't be reopened, asks the server why before sending anyone away,
 * so a failing server or network only means trying again later.
 */
export function connectShareLink(token: string, handlers: ShareLinkHandlers) {
	const url = `/live/shares/${encodeURIComponent(token)}`;
	let source: EventSource | null = null;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let closed = false;

	const gone = () => {
		if (closed) return;
		close();
		handlers.gone();
	};

	async function whyClosed() {
		let status = 0;
		const abort = new AbortController();
		try {
			// The same request the EventSource made, only to read its status
			status = (await fetch(url, { signal: abort.signal })).status;
		} catch {
			// unreachable: try again below
		} finally {
			abort.abort();
		}
		if (closed) return;
		if (GONE_STATUSES.includes(status)) gone();
		else retry = setTimeout(open, SHARE_RETRY_MS);
	}

	function open() {
		if (closed) return;
		source = new EventSource(url);
		source.addEventListener("open", () => handlers.open?.());
		source.addEventListener("message", (event: MessageEvent<string>) => {
			let message: { type?: string } & Partial<ScreeningMessage>;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message.type === "revoked") gone();
			else if (message.type === "screening") handlers.screening?.(message as ScreeningMessage);
		});
		// CONNECTING: it reconnects by itself. CLOSED: the server answered with an error
		source.addEventListener("error", () => {
			if (source?.readyState !== EventSource.CLOSED) return;
			source.close();
			void whyClosed();
		});
	}

	function close() {
		closed = true;
		clearTimeout(retry);
		source?.close();
	}

	open();
	return {
		close,
		/** Waiting for the server: silence now says nothing about the presenter */
		get reconnecting() {
			return !closed && source?.readyState !== EventSource.OPEN;
		},
	};
}
