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
} from "@postpin-io/shared/live";

/** "resync": Redis was gone for a moment, events may be lost, so clients reload everything */
export type StreamEvent = LiveEvent | { type: "resync" };
type Listener = (event: StreamEvent) => void;
/** The part of an ioredis connection the hub uses */
type Subscriber = Pick<Redis, "on" | "subscribe" | "unsubscribe">;

/**
 * One Redis subscriber per process, spread to the open SSE streams in memory.
 * A subscribed ioredis connection can't run other commands, hence its own connection.
 */
export class LiveHub {
	#redis: Subscriber;
	#listeners = new Map<string, Set<Listener>>();
	#connectedBefore = false;

	constructor(redis: Subscriber) {
		this.#redis = redis;
		this.#redis.on("message", (channel: string, message: string) => {
			const listeners = this.#listeners.get(channel);
			if (!listeners) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(message);
			} catch {
				return;
			}
			const event = v.safeParse(LiveEventSchema, parsed);
			if (!event.success) return;
			for (const listener of listeners) listener(event.output);
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

export const liveHub = live?.hub as LiveHub;
const publish: LivePublish = (channels, event) =>
	live?.publish(channels, event) ?? Promise.resolve();

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
