import { building } from "$app/env";
import * as env from "$app/env/private";
import * as v from "valibot";
import type { Redis } from "ioredis";
import {
	liveChannel,
	livePublisher,
	redisClient,
	LiveEventSchema,
	type LiveEvent,
	type LivePublish,
	type LiveScreening,
} from "@postpin-io/shared/live";
import type { LivePlayhead } from "#lib/components/screening/screening-live.ts";
import { screeningStore } from "./screening-store.ts";

/** "resync": Redis was gone for a moment, events may be lost, so clients reload everything */
export type StreamEvent = LiveEvent | { type: "resync" };
type Listener = (event: StreamEvent) => void;
/** The part of an ioredis connection the hub uses */
type Subscriber = Pick<Redis, "on" | "subscribe" | "unsubscribe">;

/** Null for anything that isn't a known event */
export function parseLiveEvent(message: string): LiveEvent | null {
	try {
		const event = v.safeParse(LiveEventSchema, JSON.parse(message));
		return event.success ? event.output : null;
	} catch {
		return null;
	}
}

/**
 * One Redis subscriber per process, spread to the open SSE streams in memory.
 * A subscribed ioredis connection can't run other commands, hence its own connection.
 */
export class LiveHub {
	#redis: Subscriber;
	#listeners = new Map<string, Set<Listener>>();
	#connectedBefore = false;
	/**
	 * Swapped for the current one whenever this module is loaded again (dev, see below): the
	 * hub outlives HMR, and with the parser of its first load it would drop every event type
	 * added since, without a word.
	 */
	parse = parseLiveEvent;

	constructor(redis: Subscriber) {
		this.#redis = redis;
		this.#redis.on("message", (channel: string, message: string) => {
			const listeners = this.#listeners.get(channel);
			if (!listeners) return;
			const event = this.parse(message);
			if (!event) return;
			for (const listener of listeners) listener(event);
		});
		// ioredis resubscribes by itself; what was published in between is lost
		this.#redis.on("ready", () => {
			if (this.#connectedBefore) {
				for (const listeners of this.#listeners.values())
					for (const l of listeners) l({ type: "resync" });
			}
			this.#connectedBefore = true;
		});
		this.#redis.on("error", (e) => console.error("[live] redis", e));
	}

	subscribe(channels: string[], listener: Listener): () => void {
		for (const channel of channels) {
			let set = this.#listeners.get(channel);
			if (!set) {
				set = new Set();
				this.#listeners.set(channel, set);
				void this.#redis.subscribe(channel);
			}
			set.add(listener);
		}
		return () => {
			for (const channel of channels) {
				const set = this.#listeners.get(channel);
				if (!set) continue;
				set.delete(listener);
				if (set.size === 0) {
					this.#listeners.delete(channel);
					void this.#redis.unsubscribe(channel);
				}
			}
		};
	}

	get streamCount() {
		return new Set([...this.#listeners.values()].flatMap((s) => [...s])).size;
	}
}

// Survive Vite HMR in dev without piling up Redis connections
const g = globalThis as typeof globalThis & {
	__postpinLive?: { hub: LiveHub; publish: LivePublish };
};
const live = building
	? null
	: (g.__postpinLive ??= { hub: new LiveHub(redisClient(env)), publish: livePublisher(env) });
if (live) live.hub.parse = parseLiveEvent;

export const liveHub = live?.hub as LiveHub;
const publish: LivePublish = (channels, event) =>
	live?.publish(channels, event) ?? Promise.resolve();

// ─── Server-sent events ─────────────────────────────────────────────────────

const HEARTBEAT_MS = 25_000;
/** Reconnecting re-checks access, so revoked members / links don't stay subscribed for long */
export const MAX_STREAM_LIFETIME_MS = 30 * 60_000;

type Send = (data: unknown) => void;

/**
 * An SSE response with the events of `channels`, until the client goes or `lifetimeMs` is over
 * (EventSource then reconnects, through the route's access check). By default each event is
 * passed on as it is; `forward` decides otherwise. `start` can send a first message.
 * Callers check access first.
 */
export function liveStream(
	request: Request,
	channels: string[],
	lifetimeMs: number,
	options: {
		forward?: (event: StreamEvent, send: Send) => void;
		start?: (send: Send) => void;
	} = {},
) {
	const { forward = (event, send) => send(event), start } = options;
	const encoder = new TextEncoder();
	let close = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const write = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};
			const send: Send = (data) => write(`data: ${JSON.stringify(data)}\n\n`);

			const unsubscribe = liveHub.subscribe(channels, (event) => forward(event, send));
			const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
			const timeout = setTimeout(() => close(), lifetimeMs);

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
			write("retry: 3000\n\n");
			start?.(send);
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
}

/** A stream for a share link's guest ends when the link expires */
export const guestStreamLifetime = (expiresAt: Date | null) =>
	expiresAt
		? Math.min(MAX_STREAM_LIFETIME_MS, Math.max(0, expiresAt.getTime() - Date.now()))
		: MAX_STREAM_LIFETIME_MS;

// ─── Screenings ─────────────────────────────────────────────────────────────

// Not awaited, like the other events: one connection publishes them in the order they come,
// and a guest who missed one gets the current state on reconnecting

/** The presenter's playhead, as of now; guests hear it at once (see screening-live.ts) */
export async function setLiveScreening(linkId: string, playhead: LivePlayhead) {
	const state: LiveScreening = { ...playhead, at: Date.now() };
	await screeningStore.set(linkId, state);
	void publish([liveChannel.screening(linkId)], { type: "screening", linkId, state });
}

/** The screening ended: its guests watch on their own again */
export async function endLiveScreening(linkId: string) {
	await screeningStore.delete(linkId);
	void publish([liveChannel.screening(linkId)], { type: "screening", linkId, state: null });
}

export const getLiveScreening = (linkId: string) => screeningStore.get(linkId);

// ─── Called after a write has been committed ────────────────────────────────

/** Markers of an export changed; guestIds = guests whose markers were among them */
export function notifyMarkers(exportId: string, guestIds: (string | null | undefined)[] = []) {
	const guests = guestIds.filter((id): id is string => !!id);
	return publish([liveChannel.export(exportId), ...guests.map(liveChannel.guest)], {
		type: "markers",
		exportId,
	});
}

/** Guests never see responses, so only members hear about them */
export function notifyResponses(exportId: string, markerId: string) {
	return publish([liveChannel.export(exportId)], { type: "responses", exportId, markerId });
}

/** Covers merges and renames too: clients also reload their markers, which embed the category */
export function notifyCategories(projectId: string) {
	return publish([liveChannel.project(projectId)], { type: "categories", projectId });
}
