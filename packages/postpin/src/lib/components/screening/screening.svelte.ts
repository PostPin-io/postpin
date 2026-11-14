import { resolve } from "$app/paths";
import {
	SCREENING_BYE_TIMEOUT_MS,
	SCREENING_RESUME_TIMEOUT_MS,
	screeningChannelName,
	screeningPatch,
	type FromScreeningWindow,
	type ScreeningState,
	type ToScreeningWindow,
} from "./screening-protocol.ts";

export type ScreeningIds = { projectId: string; timelineId: string; exportId: string };
export type ScreeningLink = { id: string; token: string };

/**
 * A presentation window, while its share link may still be on its way. `popup` is null after
 * the view was reloaded: the window is still there, but only reachable over the channel.
 */
export type ScreeningWindow = { popup: Window | null; sessionId: string; ids: ScreeningIds };

/**
 * Opens the presentation window. Call it directly in the click handler, before anything is
 * awaited: browsers block pop-ups that don't come straight from a click. Null if blocked.
 */
/** Each screening's window has its own name, so it can be found again by it */
const windowName = (sessionId: string) => `postpin-screening-${sessionId}`;

export function openScreeningWindow(ids: ScreeningIds): ScreeningWindow | null {
	const sessionId = crypto.randomUUID();
	const path = resolve(
		"/(root)/projects/[project]/timelines/[timeline]/exports/[export]/screening",
		{ project: ids.projectId, timeline: ids.timelineId, export: ids.exportId },
	);
	const popup = window.open(
		`${path}?session=${sessionId}`,
		// a name of its own: starting anew must not reuse the window the old session is closing
		windowName(sessionId),
		"popup,width=1280,height=720",
	);
	return popup && { popup, sessionId, ids };
}

/**
 * The export view's side of a running screening: keeps the presentation window in step with
 * the view's player state (see screening-protocol.ts) and notices when the window is gone.
 */
export class ScreeningSession {
	readonly exportId: string;
	readonly link: ScreeningLink;
	readonly shareUrl: string;
	/** Picked up again after the view was reloaded: the window's state counts, not the view's */
	readonly restored: boolean;

	/** The window answered; before that nothing can be controlled */
	connected = $state(false);
	/** See FromScreeningWindow: without a click in the window it can't play with sound */
	activated = $state(true);
	fullscreen = $state(false);
	qualities = $state<number[]>([]);

	/** Called with every report from the window; the view takes it over as its player state */
	onStatus: ((state: ScreeningState) => void) | undefined;

	#popup: Window | null;
	#sessionId: string;
	#channel: BroadcastChannel;
	#rev = 0;
	/** What the window shows, or was last told to show; null until it said hello */
	#remote: ScreeningState | null = null;
	#desired: ScreeningState | null = null;
	#watch: ReturnType<typeof setInterval>;
	#disposed = false;
	/** Waiting for the window's answer to `resume`, since when */
	#resumingSince: number | null;
	/** The window said `bye` and hasn't come back yet */
	#byeAt: number | null = null;

	constructor(
		win: ScreeningWindow,
		link: ScreeningLink,
		shareUrl: string,
		onclosed: () => void,
		restored = false,
	) {
		this.exportId = win.ids.exportId;
		this.link = link;
		this.shareUrl = shareUrl;
		this.restored = restored;
		this.#popup = win.popup;
		this.#sessionId = win.sessionId;
		this.#resumingSince = restored ? Date.now() : null;
		this.#channel = new BroadcastChannel(screeningChannelName(win.sessionId));
		this.#channel.onmessage = (event: MessageEvent<FromScreeningWindow>) =>
			this.#receive(event.data);
		if (restored) this.#post({ type: "resume" });

		this.#watch = setInterval(() => {
			const now = Date.now();
			// With the handle we can simply look; after a reload only the window's messages tell
			const closed =
				this.#popup?.closed ||
				(this.#byeAt !== null && now - this.#byeAt > SCREENING_BYE_TIMEOUT_MS) ||
				(this.#resumingSince !== null && now - this.#resumingSince > SCREENING_RESUME_TIMEOUT_MS);
			if (closed) onclosed();
			else if (this.#resumingSince !== null) this.#post({ type: "resume" });
		}, 500);
		// A reload keeps the screening (restoreScreening); the window waits a moment for that
		window.addEventListener("pagehide", this.#away);
	}

	#away = () => this.#post({ type: "away" });

	#post(message: ToScreeningWindow) {
		// a late push after the end must not throw on the closed channel
		if (!this.#disposed) this.#channel.postMessage(message);
	}

	#receive(message: FromScreeningWindow) {
		if (message.type === "bye") {
			this.#byeAt = Date.now();
			return;
		}
		this.#byeAt = null;
		if (message.type === "hello") {
			if (!this.#desired) return; // the view pushes its state right after the start
			// A window that starts fresh gets the view's state, also when we wanted to resume
			this.#resumingSince = null;
			this.#remote = { ...this.#desired };
			this.#post({
				type: "init",
				rev: ++this.#rev,
				state: this.#desired,
				shareUrl: this.shareUrl,
			});
			return;
		}
		if (this.#resumingSince !== null) {
			// The answer to `resume`: carry on from where the window is
			this.#resumingSince = null;
			this.#rev = message.rev;
		} else if (message.rev !== this.#rev) {
			// From before our latest change: it would bring the old state back
			return;
		}
		this.connected = true;
		this.activated = message.activated;
		this.fullscreen = message.fullscreen;
		this.qualities = message.qualities;
		this.#remote = { ...message.state };
		this.onStatus?.(message.state);
	}

	/** The state the view wants; only what differs from the window's goes out */
	push(desired: ScreeningState, frameSeconds: number) {
		this.#desired = desired;
		if (!this.#remote) return; // `init` will carry everything, or `resume` brings the window's
		const patch = screeningPatch(this.#remote, desired, frameSeconds);
		if (!patch) return;
		Object.assign(this.#remote, patch);
		this.#post({ type: "command", rev: ++this.#rev, patch });
	}

	/**
	 * Brings the window to the front. A reload of the view loses the window's handle; call this
	 * in a click, then the handle is fetched again by the window's name.
	 */
	focusWindow() {
		if (!this.#popup || this.#popup.closed) {
			// Opens nothing new while the window exists: a name that is taken just returns it
			const found = window.open("", windowName(this.#sessionId));
			if (!found) return;
			// It was gone after all: open() made an empty one
			if (found.location.href === "about:blank") return void found.close();
			this.#popup = found;
		}
		this.#popup.focus();
	}

	dispose() {
		if (this.#disposed) return;
		clearInterval(this.#watch);
		window.removeEventListener("pagehide", this.#away);
		// the window closes itself on this; close() below only works with the handle
		this.#post({ type: "close" });
		this.#disposed = true;
		this.#channel.close();
		this.#popup?.close();
	}
}

/** The screening running in this tab, if any. The export view of its export shows it. */
export const screening = new (class {
	session = $state<ScreeningSession | null>(null);
	/** Someone asked to end the screening: EndScreeningDialog asks back, then runs `after` */
	endRequest = $state<{ after?: () => void } | null>(null);
})();

// Per tab and gone with it, but a reload keeps it: enough to find the window again
const STORAGE_KEY = "postpin:screening";
type Stored = { sessionId: string; ids: ScreeningIds; link: ScreeningLink; shareUrl: string };

function readStored(): Stored | null {
	try {
		const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
		return stored?.sessionId && stored.ids?.exportId && stored.link?.id ? stored : null;
	} catch {
		return null;
	}
}

function writeStored(stored: Stored | null) {
	try {
		if (stored) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
		else sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// blocked storage: the screening works, it just doesn't survive a reload
	}
}

function run(win: ScreeningWindow, link: ScreeningLink, shareUrl: string, restored: boolean) {
	const session = new ScreeningSession(
		win,
		link,
		shareUrl,
		() => {
			if (screening.session === session) stopScreening();
		},
		restored,
	);
	screening.session = session;
}

export function startScreening(win: ScreeningWindow, link: ScreeningLink, shareUrl: string) {
	stopScreening();
	run(win, link, shareUrl, false);
	writeStored({
		sessionId: win.sessionId,
		ids: win.ids,
		link: { id: link.id, token: link.token },
		shareUrl,
	});
}

/**
 * After a reload of the export view: picks the screening of this export up again, if one was
 * running in this tab. Its window kept playing meanwhile.
 */
export function restoreScreening(exportId: string) {
	if (screening.session) return;
	const stored = readStored();
	if (!stored) return;
	if (stored.ids.exportId !== exportId) {
		// A window without its view: nothing could control it
		const channel = new BroadcastChannel(screeningChannelName(stored.sessionId));
		channel.postMessage({ type: "close" } satisfies ToScreeningWindow);
		channel.close();
		writeStored(null);
		return;
	}
	run(
		{ popup: null, sessionId: stored.sessionId, ids: stored.ids },
		stored.link,
		stored.shareUrl,
		true,
	);
}

export function stopScreening() {
	screening.session?.dispose();
	screening.session = null;
	screening.endRequest = null;
	writeStored(null);
}

/** Ends the screening after the user confirmed (EndScreeningDialog); `after` runs then */
export function requestStopScreening(after?: () => void) {
	if (!screening.session) return after?.();
	screening.endRequest = { after };
}
