/**
 * What the export view and the screening window tell each other over a BroadcastChannel.
 * The export view decides, the window plays: every change the view makes carries a new `rev`,
 * and the window's reports say which `rev` they already include. A report from before the
 * view's latest change is out of date and ignored, so a play/pause or seek is never undone
 * by a message that was on its way.
 */
export type ScreeningState = {
	/** Seconds into the video */
	time: number;
	paused: boolean;
	rate: number;
	muted: boolean;
	/** Rendition height, or "auto" */
	quality: number | "auto";
	/** Show the QR code even while the video is not at its start */
	qr: boolean;
};

export type ToScreeningWindow =
	| { type: "init"; rev: number; state: ScreeningState; shareUrl: string }
	| { type: "command"; rev: number; patch: Partial<ScreeningState> }
	/**
	 * The view was reloaded and lost its state: the window answers with a status, and for
	 * once the view takes that over (with its `rev`) instead of the other way round, so a
	 * running video just keeps playing.
	 */
	| { type: "resume" }
	/** The view's page is going away. A reload says `resume` soon; otherwise the window closes. */
	| { type: "away" }
	| { type: "close" };

export type FromScreeningWindow =
	/** Sent until the view answers with `init`, also after the window was reloaded */
	| { type: "hello" }
	/** The window's page is going away: closed, or reloaded (then a `hello` follows) */
	| { type: "bye" }
	| {
			type: "status";
			rev: number;
			state: ScreeningState;
			qualities: number[];
			/** The window was clicked or typed in: only then the browser lets it play with sound */
			activated: boolean;
			fullscreen: boolean;
	  };

/** One channel per screening, so two screenings in one browser don't control each other */
export const screeningChannelName = (sessionId: string) => `postpin:screening:${sessionId}`;

/** How long the window waits for `resume` after `away` before it closes itself */
export const SCREENING_AWAY_TIMEOUT_MS = 20_000;
/** How long the view waits for `hello` after `bye` before it takes the window for closed */
export const SCREENING_BYE_TIMEOUT_MS = 3_000;
/** A reloaded view asks for `resume` this long; no answer means the window is gone */
export const SCREENING_RESUME_TIMEOUT_MS = 8_000;

export const SCREENING_STATE_KEYS = ["paused", "rate", "muted", "quality", "qr"] as const;

/**
 * What has to be sent so the window gets from `remote` to `desired`. The time only counts as
 * changed from half a frame on: during playback the view just follows the window's reports.
 */
export function screeningPatch(
	remote: ScreeningState,
	desired: ScreeningState,
	frameSeconds: number,
): Partial<ScreeningState> | null {
	const patch: Partial<ScreeningState> = {};
	if (Math.abs(desired.time - remote.time) > frameSeconds / 2) patch.time = desired.time;
	for (const key of SCREENING_STATE_KEYS) {
		if (desired[key] !== remote[key]) Object.assign(patch, { [key]: desired[key] });
	}
	return Object.keys(patch).length > 0 ? patch : null;
}
