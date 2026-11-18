import * as env from "$app/env/private";
import * as v from "valibot";
import type { Redis } from "ioredis";
import { LiveScreeningSchema, redisClient, type LiveScreening } from "@postpin-io/shared/live";

/**
 * Where the running screenings are, by link (see screening-live.ts). In Redis, not in the
 * database: it changes every few seconds, every app instance needs it, and it has to be gone
 * by itself soon after the presenter is (closed tab, crash), which a TTL does.
 */

/** Outlives a few missed heartbeats and a reload of the presenter's view */
export const SCREENING_LIVE_TTL_SECONDS = 20;

const key = (linkId: string) => `screening:live:${linkId}`;

// Survive Vite HMR in dev without piling up Redis connections
const g = globalThis as typeof globalThis & { __postpinRedis?: Redis };
// Its own connection: the live hub's is subscribed and can't run commands. Gives up quickly
// when Redis is gone: the share view must still open, just without the screening.
const redis = () =>
	(g.__postpinRedis ??= redisClient(env, { commandTimeout: 1000, maxRetriesPerRequest: 1 }));

export const screeningStore = {
	/** Null when none runs, also when Redis can't be reached */
	async get(linkId: string): Promise<LiveScreening | null> {
		try {
			const raw = await redis().get(key(linkId));
			if (!raw) return null;
			const parsed = v.safeParse(LiveScreeningSchema, JSON.parse(raw));
			return parsed.success ? parsed.output : null;
		} catch (e) {
			console.error("[screening] read failed", e);
			return null;
		}
	},
	async set(linkId: string, state: LiveScreening) {
		await redis().set(key(linkId), JSON.stringify(state), "EX", SCREENING_LIVE_TTL_SECONDS);
	},
	async delete(linkId: string) {
		await redis().del(key(linkId));
	},
};
