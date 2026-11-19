import type { LiveScreening } from "@postpin-io/shared/live";

/**
 * While a screening runs, its guests have no video: their playhead follows the presenter's.
 * The presenter's view sends where the screening window is (ScreeningBroadcaster), the
 * server keeps the latest state for a short while and hands it to the guests, whose view
 * moves on from there by itself (ScreeningFollower). Sent are only changes, jumps and a
 * heartbeat: in between, time, rate and the clock are enough to know where the video is.
 */

export type LivePlayhead = Pick<LiveScreening, "time" | "paused" | "rate">;

/** What a guest hears: the presenter's playhead (null: no screening running), the server clock */
export type ScreeningMessage = { state: LiveScreening | null; now: number };

/** The presenter sends at least this often, also while paused: guests know it is still running */
export const SCREENING_HEARTBEAT_MS = 3_000;
/** Guests heard nothing for this long: the presenter is gone, they watch on their own again */
export const SCREENING_STALE_MS = 15_000;
/** The screening window is this far from where guests think it is (a stall, a jump): send now */
export const SCREENING_DRIFT_SECONDS = 0.25;
/** At most this often, e.g. while scrubbing; the latest state always goes out in the end */
export const SCREENING_MIN_INTERVAL_MS = 100;

/** Where the playhead is `elapsedMs` after `state` was current; never before 0 or past `duration` */
export function livePosition(state: LivePlayhead, elapsedMs: number, duration = Infinity) {
	const time = state.paused
		? state.time
		: state.time + (Math.max(0, elapsedMs) / 1000) * state.rate;
	return Math.min(duration, Math.max(0, time));
}

/** Guests would be wrong about the playhead, or haven't heard from the presenter for a while */
export function broadcastDue(
	last: { state: LivePlayhead; at: number } | null,
	current: LivePlayhead,
	now: number,
) {
	if (!last) return true;
	if (current.paused !== last.state.paused || current.rate !== last.state.rate) return true;
	const expected = livePosition(last.state, now - last.at);
	if (Math.abs(current.time - expected) > SCREENING_DRIFT_SECONDS) return true;
	return now - last.at >= SCREENING_HEARTBEAT_MS;
}

/**
 * The presenter's side: gets every state of the screening window and sends what guests need
 * (see broadcastDue), throttled. `send` failing is fine: the next heartbeat tries again.
 */
export class ScreeningBroadcaster {
	#send: (state: LivePlayhead) => Promise<unknown>;
	#now: () => number;
	#last: { state: LivePlayhead; at: number } | null = null;
	#latest: LivePlayhead | null = null;
	#latestAt = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	/** One request at a time: two on the way could arrive the wrong way round, a pause before its play */
	#sending = false;
	#ended = false;

	constructor(send: (state: LivePlayhead) => Promise<unknown>, now = () => Date.now()) {
		this.#send = send;
		this.#now = now;
	}

	/** The screening window's state changed */
	update(state: LivePlayhead) {
		if (this.#ended) return;
		const now = this.#now();
		this.#latest = { time: state.time, paused: state.paused, rate: state.rate };
		this.#latestAt = now;
		if (this.#timer !== undefined || this.#sending) return; // goes out with the next send
		if (!broadcastDue(this.#last, this.#latest, now)) return;
		const wait = this.#last ? this.#last.at + SCREENING_MIN_INTERVAL_MS - now : 0;
		if (wait > 0) this.#timer = setTimeout(() => this.#flush(), wait);
		else this.#flush();
	}

	/**
	 * Call regularly: sends the heartbeat when nothing changed. Moves the last state on by the
	 * clock, so a window that stopped reporting doesn't pull the guests back to its last report.
	 */
	tick() {
		if (!this.#latest) return;
		const time = livePosition(this.#latest, this.#now() - this.#latestAt);
		this.update({ ...this.#latest, time });
	}

	#flush() {
		this.#timer = undefined;
		if (this.#ended || !this.#latest) return;
		// as it is now, not as it was when the throttle started
		const now = this.#now();
		const state = { ...this.#latest, time: livePosition(this.#latest, now - this.#latestAt) };
		this.#last = { state, at: now };
		this.#sending = true;
		this.#send(state)
			.catch(() => {
				// the next heartbeat tries again
			})
			.finally(() => {
				this.#sending = false;
				// whatever changed meanwhile
				this.tick();
			});
	}

	/** No more sending; the screening's end is said separately */
	stop() {
		this.#ended = true;
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}
}
