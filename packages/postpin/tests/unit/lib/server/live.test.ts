import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// live.ts connects on import unless building; the hub under test gets a fake connection instead
vi.mock("$app/env", () => ({ building: true }));
vi.mock("$app/env/private", () => ({}));

const { LiveHub } = await import("#lib/server/live.ts");

class FakeRedis extends EventEmitter {
	subscribe = vi.fn(async () => 1);
	unsubscribe = vi.fn(async () => 0);
}

function setup() {
	const redis = new FakeRedis();
	const hub = new LiveHub(redis as never);
	const message = (channel: string, event: unknown) =>
		redis.emit("message", channel, typeof event === "string" ? event : JSON.stringify(event));
	return { redis, hub, message };
}

const markersEvent = { type: "markers", exportId: "e1" };

describe("LiveHub", () => {
	it("subscribes to a channel once and hands its events to every listener", () => {
		const { redis, hub, message } = setup();
		const a = vi.fn();
		const b = vi.fn();
		hub.subscribe(["live:export:e1"], a);
		hub.subscribe(["live:export:e1"], b);

		message("live:export:e1", markersEvent);

		expect(redis.subscribe).toHaveBeenCalledTimes(1);
		expect(a).toHaveBeenCalledWith(markersEvent);
		expect(b).toHaveBeenCalledWith(markersEvent);
	});

	it("only delivers the channels a listener asked for", () => {
		const { hub, message } = setup();
		const guest = vi.fn();
		hub.subscribe(["live:guest:g1"], guest);

		message("live:export:e1", markersEvent);
		message("live:guest:g2", markersEvent);

		expect(guest).not.toHaveBeenCalled();
	});

	it("unsubscribes from Redis once the last listener of a channel is gone", () => {
		const { redis, hub, message } = setup();
		const a = vi.fn();
		const offA = hub.subscribe(["live:export:e1", "live:project:p1"], a);
		const offB = hub.subscribe(["live:export:e1"], vi.fn());

		offA();
		expect(redis.unsubscribe).toHaveBeenCalledTimes(1);
		expect(redis.unsubscribe).toHaveBeenCalledWith("live:project:p1");

		offB();
		expect(redis.unsubscribe).toHaveBeenCalledWith("live:export:e1");
		expect(hub.streamCount).toBe(0);

		message("live:export:e1", markersEvent);
		expect(a).not.toHaveBeenCalled();
	});

	it("ignores messages that aren't JSON or no live event", () => {
		const { hub, message } = setup();
		const listener = vi.fn();
		hub.subscribe(["live:export:e1"], listener);

		message("live:export:e1", "not json");
		message("live:export:e1", { type: "markers" });
		message("live:export:e1", { type: "something-else", exportId: "e1" });

		expect(listener).not.toHaveBeenCalled();
	});

	it("tells every listener to resync after Redis reconnects, but not on the first connect", () => {
		const { redis, hub } = setup();
		const listener = vi.fn();
		hub.subscribe(["live:export:e1"], listener);

		redis.emit("ready");
		expect(listener).not.toHaveBeenCalled();

		redis.emit("ready");
		expect(listener).toHaveBeenCalledWith({ type: "resync" });
	});

	it("counts each stream once, however many channels it listens to", () => {
		const { hub } = setup();
		hub.subscribe(["live:export:e1", "live:project:p1"], vi.fn());
		hub.subscribe(["live:export:e2"], vi.fn());
		expect(hub.streamCount).toBe(2);
	});
});
