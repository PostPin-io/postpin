import {
	SCREENING_STALE_MS,
	livePosition,
	type LivePlayhead,
	type ScreeningMessage,
} from "./screening-live.ts";

type Reference = LivePlayhead & {
	/** The server's time of the presenter's report: orders reports across reconnects */
	at: number;
	/** When `time` was current, on this browser's clock */
	localAt: number;
};

/**
 * A screening guest's side (see screening-live.ts): whether the screening runs and where its
 * playhead is. First from getShareInfo, then from the link's stream (connectShareLink), which
 * sends the current state on every (re)connect. Only the server's clock is compared with
 * itself, so a phone whose clock is off still lands on the right frame; what's left is the
 * network's delay.
 */
export class ScreeningFollower {
	#ref = $state<Reference | null>(null);
	#heardAt = 0;
	#now: () => number;

	constructor(initial: ScreeningMessage | null, now = () => Date.now()) {
		this.#now = now;
		if (initial) this.receive(initial);
	}

	/** A screening is running: the guest's view follows it instead of playing the video */
	get live() {
		return this.#ref !== null;
	}

	get paused() {
		return this.#ref?.paused ?? true;
	}

	get rate() {
		return this.#ref?.rate ?? 1;
	}

	receive({ state, now }: ScreeningMessage) {
		const local = this.#now();
		this.#heardAt = local;
		if (!state) {
			this.#ref = null;
			return;
		}
		// From before the latest one: it would move the playhead back
		if (this.#ref && state.at < this.#ref.at) return;
		this.#ref = {
			time: livePosition(state, now - state.at),
			paused: state.paused,
			rate: state.rate,
			at: state.at,
			localAt: local,
		};
	}

	/** Seconds into the video, now; null while no screening runs */
	position(duration?: number) {
		const ref = this.#ref;
		return ref ? livePosition(ref, this.#now() - ref.localAt, duration) : null;
	}

	/** The presenter sends a heartbeat; without one for long, they are gone (closed tab, crash) */
	checkStale() {
		if (this.#ref && this.#now() - this.#heardAt > SCREENING_STALE_MS) this.#ref = null;
	}

	/** (Re)connected: the current state is on its way, the silence before doesn't count */
	heard() {
		this.#heardAt = this.#now();
	}
}
