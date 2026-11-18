import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SCREENING_HEARTBEAT_MS,
	SCREENING_MIN_INTERVAL_MS,
	ScreeningBroadcaster,
	broadcastDue,
	livePosition,
	type LivePlayhead,
} from "#lib/components/screening/screening-live.ts";

const playing = (time: number, rate = 1): LivePlayhead => ({ time, paused: false, rate });
const paused = (time: number): LivePlayhead => ({ time, paused: true, rate: 1 });

describe("livePosition", () => {
	it("moves on by the clock and the rate while playing", () => {
		expect(livePosition(playing(10), 1500)).toBe(11.5);
		expect(livePosition(playing(10, 2), 1500)).toBe(13);
	});

	it("stays while paused", () => {
		expect(livePosition(paused(10), 5000)).toBe(10);
	});

	it("never before the start or past the end", () => {
		expect(livePosition(playing(1, -4), 1000)).toBe(0);
		expect(livePosition(playing(59), 5000, 60)).toBe(60);
		// a clock that went backwards doesn't move it back
		expect(livePosition(playing(10), -500)).toBe(10);
	});
});

describe("broadcastDue", () => {
	const last = { state: playing(10), at: 0 };

	it("the first state, and every change of play/pause or speed", () => {
		expect(broadcastDue(null, paused(0), 0)).toBe(true);
		expect(broadcastDue(last, { ...playing(10.1), paused: true }, 100)).toBe(true);
		expect(broadcastDue(last, playing(10.1, 2), 100)).toBe(true);
	});

	it("not while playback goes on as expected", () => {
		expect(broadcastDue(last, playing(11), 1000)).toBe(false);
		expect(broadcastDue(last, playing(11.2), 1000)).toBe(false);
	});

	it("a jump, or a stall of the window, is more than guests would guess", () => {
		expect(broadcastDue(last, playing(42), 1000)).toBe(true);
		expect(broadcastDue(last, playing(10.1), 1000)).toBe(true);
	});

	it("the heartbeat, also when nothing changed", () => {
		const still = { state: paused(5), at: 0 };
		expect(broadcastDue(still, paused(5), SCREENING_HEARTBEAT_MS - 1)).toBe(false);
		expect(broadcastDue(still, paused(5), SCREENING_HEARTBEAT_MS)).toBe(true);
	});
});

describe("ScreeningBroadcaster", () => {
	let now: number;
	let sent: LivePlayhead[];
	let pending: (() => void)[];
	let broadcaster: ScreeningBroadcaster;

	/** Each send waits until the test lets it finish */
	const send = (state: LivePlayhead) => {
		sent.push(state);
		return new Promise<void>((resolve) => pending.push(resolve));
	};
	/** then / catch / finally each take a turn of the microtask queue */
	const settle = async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve();
	};
	const finish = async () => {
		pending.shift()?.();
		await settle();
	};
	const advance = (ms: number) => {
		now += ms;
		vi.advanceTimersByTime(ms);
	};

	beforeEach(() => {
		vi.useFakeTimers();
		now = 1_000_000;
		sent = [];
		pending = [];
		broadcaster = new ScreeningBroadcaster(send, () => now);
	});
	afterEach(() => vi.useRealTimers());

	it("sends the first state at once, then only what guests need", async () => {
		broadcaster.update(paused(0));
		await finish();
		advance(500);
		broadcaster.update(paused(0));
		expect(sent).toEqual([paused(0)]);
	});

	it("one request at a time: what changed meanwhile follows, the latest state only", async () => {
		broadcaster.update(paused(0));
		advance(200);
		broadcaster.update(playing(0));
		broadcaster.update(paused(3));
		expect(sent).toHaveLength(1);

		await finish();
		expect(sent).toEqual([paused(0), paused(3)]);
	});

	it("at most every SCREENING_MIN_INTERVAL_MS while scrubbing, and the last position in the end", async () => {
		broadcaster.update(paused(0));
		await finish();
		advance(10);
		broadcaster.update(paused(5));
		broadcaster.update(paused(9));
		expect(sent).toHaveLength(1);

		advance(SCREENING_MIN_INTERVAL_MS);
		expect(sent).toEqual([paused(0), paused(9)]);
	});

	it("the heartbeat moves a playing state on by the clock: a window that stopped reporting doesn't pull guests back", async () => {
		broadcaster.update(playing(10));
		await finish();
		advance(SCREENING_HEARTBEAT_MS);
		broadcaster.tick();
		expect(sent.at(-1)).toEqual(playing(10 + SCREENING_HEARTBEAT_MS / 1000));
	});

	it("a failed send is tried again with the next heartbeat", async () => {
		const failing = vi.fn(async () => {
			throw new Error("offline");
		});
		const b = new ScreeningBroadcaster(failing, () => now);
		b.update(paused(1));
		await settle();
		advance(SCREENING_HEARTBEAT_MS);
		b.tick();
		expect(failing).toHaveBeenCalledTimes(2);
	});

	it("sends nothing after stop", async () => {
		broadcaster.update(paused(0));
		await finish();
		advance(10);
		broadcaster.update(paused(5));
		broadcaster.stop();
		advance(SCREENING_HEARTBEAT_MS);
		broadcaster.tick();
		expect(sent).toEqual([paused(0)]);
	});
});
