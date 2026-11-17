import { Redis } from "ioredis";
import * as v from "valibot";
import type { RedisEnv } from "../env/index.ts";

/** Channel names: members listen per export and project, guests only to their own markers */
export const liveChannel = {
	export: (exportId: string) => `live:export:${exportId}`,
	guest: (guestId: string) => `live:guest:${guestId}`,
	project: (projectId: string) => `live:project:${projectId}`,
};

/** Events only say what to reload; the data comes from the access-checked queries */
export const LiveEventSchema = v.variant("type", [
	v.object({ type: v.literal("markers"), exportId: v.string() }),
	v.object({ type: v.literal("responses"), exportId: v.string(), markerId: v.string() }),
	v.object({ type: v.literal("categories"), projectId: v.string() }),
]);
export type LiveEvent = v.InferOutput<typeof LiveEventSchema>;

export function redisClient(env: RedisEnv) {
	return new Redis({
		host: env.REDIS_HOST,
		port: env.REDIS_PORT,
		...(env.REDIS_USE_SSL && { tls: {} }),
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
