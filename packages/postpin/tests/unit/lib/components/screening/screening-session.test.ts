import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	screeningChannelName,
	type FromScreeningWindow,
	type ScreeningState,
	type ToScreeningWindow,
} from "#lib/components/screening/screening-protocol.ts";

vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));

const { ScreeningSession, requestStopScreening, screening, startScreening, stopScreening } =
	await import("#lib/components/screening/screening.svelte.ts");

/**
 * The export view's side of a screening against a stand-in for the presentation window:
 * a second BroadcastChannel that answers like the window's page does.
 */

const FRAME = 1 / 25;
const state = (change: Partial<ScreeningState> = {}): ScreeningState => ({
	time: 0,
	paused: true,
	rate: 1,
	muted: false,
	quality: "auto",
	qr: false,
	...change,
});

/** BroadcastChannel delivers asynchronously */
const delivered = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakePopup() {
	return { closed: false, close: vi.fn(), focus: vi.fn() };
}

/** The window's end of the channel: records what arrives, sends what the test says */
function fakeWindow(sessionId: string) {
	const channel = new BroadcastChannel(screeningChannelName(sessionId));
	const received: ToScreeningWindow[] = [];
	channel.onmessage = (event) => received.push(event.data as ToScreeningWindow);
	return {
		received,
		send: (message: FromScreeningWindow) => channel.postMessage(message),
		status: (rev: number, s: ScreeningState, extra: { activated?: boolean } = {}) =>
			channel.postMessage({
				type: "status",
				rev,
				state: s,
				qualities: [1080, 720],
				activated: extra.activated ?? true,
				fullscreen: false,
			} satisfies FromScreeningWindow),
		close: () => channel.close(),
	};
}

let popup: ReturnType<typeof fakePopup>;
let win: ReturnType<typeof fakeWindow>;
let session: InstanceType<typeof ScreeningSession>;
let onclosed: ReturnType<typeof vi.fn<() => void>>;
let statuses: ScreeningState[];

beforeEach(() => {
	vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
	popup = fakePopup();
	win = fakeWindow("s1");
	onclosed = vi.fn<() => void>();
	session = new ScreeningSession(
		{
			popup: popup as unknown as Window,
			sessionId: "s1",
			ids: { projectId: "p", timelineId: "t", exportId: "e" },
		},
		{ id: "link", token: "tok" },
		"http://localhost/s/tok",
		onclosed,
	);
	statuses = [];
	session.onStatus = (s) => statuses.push(s);
});

afterEach(() => {
	session.dispose();
	win.close();
	vi.unstubAllGlobals();
});

/** The window says hello and reports the state it was given, as its page does */
async function connect(initial = state()) {
	session.push(initial, FRAME);
	win.send({ type: "hello" });
	await delivered();
	const init = win.received.at(-1)!;
	if (init.type !== "init") throw new Error("expected init");
	win.status(init.rev, init.state);
	await delivered();
	return init.rev;
}

describe("ScreeningSession", () => {
	it("answers the window's hello with the full state and the share URL", async () => {
		session.push(state({ time: 0, quality: 720 }), FRAME);
		expect(session.connected).toBe(false);
		win.send({ type: "hello" });
		await delivered();

		expect(win.received).toEqual([
			{
				type: "init",
				rev: 1,
				state: state({ quality: 720 }),
				shareUrl: "http://localhost/s/tok",
			},
		]);
	});

	it("is connected once the window reports, and hands the report to the view", async () => {
		await connect();
		expect(session.connected).toBe(true);
		expect(session.qualities).toEqual([1080, 720]);
		expect(statuses).toEqual([state()]);
	});

	it("sends nothing before the window is there: init carries everything", async () => {
		session.push(state({ paused: false }), FRAME);
		await delivered();
		expect(win.received).toEqual([]);
	});

	it("sends only what changed, each change with a new rev", async () => {
		const rev = await connect();
		session.push(state({ paused: false }), FRAME);
		session.push(state({ paused: false }), FRAME); // nothing new
		session.push(state({ paused: false, time: 42 }), FRAME);
		await delivered();

		expect(win.received.slice(1)).toEqual([
			{ type: "command", rev: rev + 1, patch: { paused: false } },
			{ type: "command", rev: rev + 2, patch: { time: 42 } },
		]);
	});

	it("following the window's playback is no seek", async () => {
		const rev = await connect(state({ paused: false }));
		// the window plays on and reports; the view takes each report over and pushes it back
		for (const time of [0.04, 0.08, 0.12]) {
			win.status(rev, state({ paused: false, time }));
			await delivered();
			session.push(statuses.at(-1)!, FRAME);
		}
		await delivered();
		expect(win.received).toHaveLength(1); // only the init
		expect(statuses.at(-1)!.time).toBe(0.12);
	});

	it("a report from before the view's latest change doesn't undo it", async () => {
		const rev = await connect();
		session.push(state({ paused: false }), FRAME); // the user presses play
		win.status(rev, state({ paused: true, time: 0 })); // was on its way already
		await delivered();
		expect(statuses).toHaveLength(1); // only the one from connect()

		win.status(rev + 1, state({ paused: false, time: 0.04 }));
		await delivered();
		expect(statuses.at(-1)).toEqual(state({ paused: false, time: 0.04 }));
	});

	it("the window pausing by itself (end of video, blocked sound) reaches the view", async () => {
		const rev = await connect();
		session.push(state({ paused: false }), FRAME);
		win.status(rev + 1, state({ paused: true }), { activated: false });
		await delivered();

		expect(statuses.at(-1)!.paused).toBe(true);
		expect(session.activated).toBe(false);
		// the view shows "paused" now; that is no new command
		session.push(state({ paused: true }), FRAME);
		await delivered();
		expect(win.received.filter((m) => m.type === "command")).toHaveLength(1);
	});

	it("a reloaded window says hello again and gets the current state", async () => {
		await connect();
		session.push(state({ time: 30, paused: false }), FRAME);
		win.send({ type: "hello" });
		await delivered();

		expect(win.received.at(-1)).toMatchObject({
			type: "init",
			state: state({ time: 30, paused: false }),
		});
	});

	it("notices when the window was closed", async () => {
		vi.useFakeTimers();
		try {
			const closedPopup = fakePopup();
			const other = new ScreeningSession(
				{
					popup: closedPopup as unknown as Window,
					sessionId: "s2",
					ids: { projectId: "p", timelineId: "t", exportId: "e" },
				},
				{ id: "link", token: "tok" },
				"http://localhost/s/tok",
				onclosed,
			);
			vi.advanceTimersByTime(1000);
			expect(onclosed).not.toHaveBeenCalled();
			closedPopup.closed = true;
			vi.advanceTimersByTime(600);
			expect(onclosed).toHaveBeenCalled();
			other.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it("tells the window when the view's page goes away, and doesn't close it: a reload comes back", async () => {
		await connect();
		const listeners = vi.mocked(window.addEventListener).mock.calls;
		const pagehide = listeners.find(([type]) => type === "pagehide")![1] as () => void;
		pagehide();
		await delivered();
		expect(win.received.at(-1)).toEqual({ type: "away" });
		expect(popup.close).not.toHaveBeenCalled();
	});

	it("dispose tells the window to close and closes it", async () => {
		await connect();
		session.dispose();
		await delivered();
		expect(win.received.at(-1)).toEqual({ type: "close" });
		expect(popup.close).toHaveBeenCalled();
	});
});

describe("ScreeningSession after a reload of the view", () => {
	// The reloaded view has no window handle and no state: only the channel
	let restored: InstanceType<typeof ScreeningSession>;
	let seen: ScreeningState[];
	let closed: ReturnType<typeof vi.fn<() => void>>;
	let other: ReturnType<typeof fakeWindow>;

	beforeEach(() => {
		other = fakeWindow("r1");
		closed = vi.fn<() => void>();
		restored = new ScreeningSession(
			{ popup: null, sessionId: "r1", ids: { projectId: "p", timelineId: "t", exportId: "e" } },
			{ id: "link", token: "tok" },
			"http://localhost/s/tok",
			closed,
			true,
		);
		seen = [];
		restored.onStatus = (s) => seen.push(s);
	});
	afterEach(() => {
		restored.dispose();
		other.close();
	});

	it("asks the window to resume", async () => {
		await delivered();
		expect(other.received).toEqual([{ type: "resume" }]);
		expect(restored.restored).toBe(true);
	});

	it("finds the window again by its name to bring it to the front", () => {
		const found = {
			closed: false,
			focus: vi.fn(),
			close: vi.fn(),
			location: { href: "http://x/screening" },
		};
		const open = vi.fn(() => found);
		vi.stubGlobal("window", { ...window, open });
		restored.focusWindow();
		expect(open).toHaveBeenCalledWith("", "postpin-screening-r1");
		expect(found.focus).toHaveBeenCalled();
	});

	it("closes what open() made when the window was gone after all", () => {
		const blank = {
			closed: false,
			focus: vi.fn(),
			close: vi.fn(),
			location: { href: "about:blank" },
		};
		vi.stubGlobal("window", { ...window, open: vi.fn(() => blank) });
		restored.focusWindow();
		expect(blank.close).toHaveBeenCalled();
		expect(blank.focus).not.toHaveBeenCalled();
	});

	it("takes over the window's state instead of pushing its own: playback goes on", async () => {
		// the view comes up paused at its saved playhead; that must not reach the window
		restored.push(state({ time: 3, paused: true }), FRAME);
		other.status(17, state({ time: 95.2, paused: false }));
		await delivered();

		expect(seen).toEqual([state({ time: 95.2, paused: false })]);
		expect(restored.connected).toBe(true);
		expect(other.received.every((m) => m.type === "resume")).toBe(true);

		// from here on it is a session like any other, counting on from the window's rev
		restored.push(state({ time: 95.2, paused: true }), FRAME);
		await delivered();
		expect(other.received.at(-1)).toEqual({ type: "command", rev: 18, patch: { paused: true } });
	});

	it("a window that was reloaded too gets the view's state", async () => {
		restored.push(state({ time: 3 }), FRAME);
		other.send({ type: "hello" });
		await delivered();
		expect(other.received.at(-1)).toMatchObject({ type: "init", state: state({ time: 3 }) });
	});

	it("gives up when the window doesn't answer: it was closed meanwhile", () => {
		vi.useFakeTimers();
		try {
			const gone = vi.fn<() => void>();
			const session2 = new ScreeningSession(
				{ popup: null, sessionId: "r2", ids: { projectId: "p", timelineId: "t", exportId: "e" } },
				{ id: "link", token: "tok" },
				"u",
				gone,
				true,
			);
			vi.advanceTimersByTime(7000);
			expect(gone).not.toHaveBeenCalled();
			vi.advanceTimersByTime(2000);
			expect(gone).toHaveBeenCalled();
			session2.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it("a bye without a new hello means the window was closed", async () => {
		other.status(1, state());
		await delivered();
		other.send({ type: "bye" });
		await delivered();
		expect(closed).not.toHaveBeenCalled();
		await new Promise((resolve) => setTimeout(resolve, 3600));
		expect(closed).toHaveBeenCalled();
	});

	it("a bye followed by a hello was only a reload of the window", async () => {
		other.status(1, state());
		await delivered();
		restored.push(state(), FRAME);
		other.send({ type: "bye" });
		other.send({ type: "hello" });
		await new Promise((resolve) => setTimeout(resolve, 3600));
		expect(closed).not.toHaveBeenCalled();
	});
});

describe("startScreening / stopScreening", () => {
	const open = (sessionId: string, p = fakePopup()) => ({
		popup: p as unknown as Window,
		sessionId,
		ids: { projectId: "p", timelineId: "t", exportId: "e" },
	});

	it("one screening at a time: starting another ends the first", () => {
		const first = fakePopup();
		startScreening(open("a", first), { id: "l1", token: "t1" }, "u1");
		const firstSession = screening.session;
		startScreening(open("b"), { id: "l2", token: "t2" }, "u2");

		expect(first.close).toHaveBeenCalled();
		expect(screening.session).not.toBe(firstSession);
		expect(screening.session?.link.id).toBe("l2");
		stopScreening();
		expect(screening.session).toBeNull();
	});

	it("ending is asked back first; without a screening there is nothing to ask", () => {
		const after = vi.fn();
		requestStopScreening(after);
		expect(after).toHaveBeenCalled();
		expect(screening.endRequest).toBeNull();

		startScreening(open("c"), { id: "l3", token: "t3" }, "u3");
		const later = vi.fn();
		requestStopScreening(later);
		expect(later).not.toHaveBeenCalled();
		expect(screening.endRequest).not.toBeNull();
		expect(screening.session).not.toBeNull();

		stopScreening();
		expect(screening.endRequest).toBeNull();
	});
});
