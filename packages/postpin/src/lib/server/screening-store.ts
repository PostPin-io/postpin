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
/** The presenter's session that runs it: only that one may move the playhead or end it */
const ownerKey = (linkId: string) => `screening:owner:${linkId}`;

// Checked and written in one go, so two sessions can't interleave and hand it back and forth.
// A session takes the screening over with `claim`; otherwise it may only go on with its own.
// The owner's key expiring with the state means a session that was gone long may go on.
// Ending leaves ENDED as the owner for a while: a report still on its way from the session
// that ended it must not start the screening again for the guests.
const SET_SCRIPT = `
local owner = redis.call('GET', KEYS[2])
if ARGV[3] ~= '1' and owner and owner ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[4])
return 1`;
const DELETE_SCRIPT = `
local owner = redis.call('GET', KEYS[2])
if ARGV[1] ~= '' and owner and owner ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1`;
/** Never a session's id (those are UUIDs) */
const ENDED = "-";

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
	/** False when another session runs the screening now (it took it over) */
	async set(linkId: string, sessionId: string, state: LiveScreening, claim: boolean) {
		const done = await redis().eval(
			SET_SCRIPT,
			2,
			key(linkId),
			ownerKey(linkId),
			sessionId,
			JSON.stringify(state),
			claim ? "1" : "0",
			SCREENING_LIVE_TTL_SECONDS,
		);
		return done === 1;
	},
	/** Only the owner's session ends it; without `sessionId` it ends whoever runs it */
	async delete(linkId: string, sessionId?: string) {
		const done = await redis().eval(
			DELETE_SCRIPT,
			2,
			key(linkId),
			ownerKey(linkId),
			sessionId ?? "",
			ENDED,
			SCREENING_LIVE_TTL_SECONDS,
		);
		return done === 1;
	},
};
