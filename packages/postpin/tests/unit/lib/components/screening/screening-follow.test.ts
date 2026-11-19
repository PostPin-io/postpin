import { beforeEach, describe, expect, it } from "vitest";
import { ScreeningFollower } from "#lib/components/screening/screening-follow.svelte.ts";
import { SCREENING_STALE_MS } from "#lib/components/screening/screening-live.ts";

// The server's clock runs at 1_000_000 when the guest's phone says 5_000: only the server's
// times are compared with each other, so the phone's clock being off doesn't matter
const SERVER = 1_000_000;
let local: number;
const follower = (initial: ConstructorParameters<typeof ScreeningFollower>[0] = null) =>
	new ScreeningFollower(initial, () => local);
const state = (time: number, paused = false, at = SERVER) => ({ time, paused, rate: 1, at });

beforeEach(() => {
	local = 5_000;
});

describe("ScreeningFollower", () => {
	it("no screening running: not live, no position", () => {
		const f = follower({ state: null, now: SERVER });
		expect(f.live).toBe(false);
		expect(f.position()).toBeNull();
	});

	it("takes the age of the report from the server's clock, then moves on by its own", () => {
		// reported 2 s before the server sent it
		const f = follower({ state: state(10), now: SERVER + 2_000 });
		expect(f.live).toBe(true);
		expect(f.position()).toBe(12);
		local += 500;
		expect(f.position()).toBe(12.5);
	});

	it("a paused screening stays where it is", () => {
		const f = follower({ state: state(10, true), now: SERVER + 2_000 });
		local += 5_000;
		expect(f.position()).toBe(10);
		expect(f.paused).toBe(true);
	});

	it("never past the end of the video", () => {
		const f = follower({ state: state(59), now: SERVER });
		local += 5_000;
		expect(f.position(60)).toBe(60);
	});

	it("an older report (across a reconnect) doesn't move the playhead back", () => {
		const f = follower({ state: state(20, false, SERVER + 1_000), now: SERVER + 1_000 });
		f.receive({ state: state(10), now: SERVER + 1_000 });
		expect(f.position()).toBe(20);
	});

	it("the screening's end makes the guest watch on their own", () => {
		const f = follower({ state: state(10), now: SERVER });
		f.receive({ state: null, now: SERVER + 100 });
		expect(f.live).toBe(false);
	});

	it("gives up when the presenter's heartbeat is missing", () => {
		const f = follower({ state: state(10), now: SERVER });
		local += SCREENING_STALE_MS;
		f.checkStale();
		expect(f.live).toBe(true);
		local += 1;
		f.checkStale();
		expect(f.live).toBe(false);
	});

	it("a heartbeat keeps it running", () => {
		const f = follower({ state: state(10, true), now: SERVER });
		local += SCREENING_STALE_MS - 1;
		f.receive({ state: state(10, true, SERVER + 14_000), now: SERVER + 14_000 });
		local += 2;
		f.checkStale();
		expect(f.live).toBe(true);
	});
});
