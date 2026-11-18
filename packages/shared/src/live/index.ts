import { Redis, type RedisOptions } from "ioredis";
import * as v from "valibot";
import type { RedisEnv } from "../env/index.ts";

/**
 * Channel names: members listen per export and project, guests only to their own markers.
 * Every guest also listens to their link: whether it was deleted, and a screening's playhead.
 */
export const liveChannel = {
	export: (exportId: string) => `live:export:${exportId}`,
	guest: (guestId: string) => `live:guest:${guestId}`,
	project: (projectId: string) => `live:project:${projectId}`,
	shareLink: (linkId: string) => `live:share-link:${linkId}`,
};

/** Where the presenter's playhead is. `at`: server time (ms) when `time` was current. */
export const LiveScreeningSchema = v.object({
	time: v.number(),
	paused: v.boolean(),
	rate: v.number(),
	at: v.number(),
});
export type LiveScreening = v.InferOutput<typeof LiveScreeningSchema>;

/**
 * Most events only say what to reload; the data comes from the access-checked queries.
 * The screening's playhead travels in the event: reloading it 30 times a second would be
 * too slow, and the stream checked the guest's access when it was opened.
 * `state: null`: the screening ended.
 */
export const LiveEventSchema = v.variant("type", [
	v.object({ type: v.literal("markers"), exportId: v.string() }),
	v.object({ type: v.literal("responses"), exportId: v.string(), markerId: v.string() }),
	v.object({ type: v.literal("categories"), projectId: v.string() }),
	v.object({
		type: v.literal("screening"),
		linkId: v.string(),
		state: v.nullable(LiveScreeningSchema),
	}),
	/** Its guests are sent away at once, not with their next request */
	v.object({ type: v.literal("shareLinkRevoked"), linkId: v.string() }),
]);
export type LiveEvent = v.InferOutput<typeof LiveEventSchema>;

export function redisClient(env: RedisEnv, options: RedisOptions = {}) {
	return new Redis({
		host: env.REDIS_HOST,
		port: env.REDIS_PORT,
		...(env.REDIS_USE_SSL && { tls: {} }),
		...options,
	});
}

export type LivePublish = (channels: string[], event: LiveEvent) => Promise<void>;

/** Never throws: a lost live event must not fail the write that caused it */
export function livePublisher(env: RedisEnv): LivePublish {
	let redis: Redis | null = null;
	return async (channels, event) => {
		if (channels.length === 0) return;
		redis ??= redisClient(env);
		const message = JSON.stringify(event);
		try {
			const pipeline = redis.pipeline();
			for (const channel of new Set(channels)) pipeline.publish(channel, message);
			await pipeline.exec();
		} catch (e) {
			console.error("[live] publish failed", e);
		}
	};
}
