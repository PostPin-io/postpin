import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHARE_RETRY_MS, connectShareLink } from "#lib/components/share-view/share-live.ts";

/** Stand-in for the browser's EventSource: the test opens, sends and fails it */
class FakeEventSource extends EventTarget {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: FakeEventSource[] = [];
	readyState = FakeEventSource.CONNECTING;
	constructor(public url: string) {
		super();
		FakeEventSource.instances.push(this);
	}
	open() {
		this.readyState = FakeEventSource.OPEN;
		this.dispatchEvent(new Event("open"));
	}
	send(data: unknown) {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
	}
	/** The server answered with an error status: EventSource gives up for good */
	refuse() {
		this.readyState = FakeEventSource.CLOSED;
		this.dispatchEvent(new Event("error"));
	}
	close = vi.fn(() => {
		this.readyState = FakeEventSource.CLOSED;
	});
}

let fetchStatus: number | "offline";
const latest = () => FakeEventSource.instances.at(-1)!;

beforeEach(() => {
	vi.useFakeTimers();
	FakeEventSource.instances = [];
	fetchStatus = 200;
	vi.stubGlobal("EventSource", FakeEventSource);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			if (fetchStatus === "offline") throw new TypeError("Failed to fetch");
			return new Response(null, { status: fetchStatus });
		}),
	);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("connectShareLink", () => {
	it("listens to the link's stream and hands on the screening's messages", () => {
		const screening = vi.fn();
		const open = vi.fn();
		const link = connectShareLink("a b", { screening, open, gone: vi.fn() });
		expect(latest().url).toBe("/live/shares/a%20b");
		expect(link.reconnecting).toBe(true);

		latest().open();
		expect(open).toHaveBeenCalled();
		expect(link.reconnecting).toBe(false);
		const message = { type: "screening", state: null, now: 1 };
		latest().send(message);
		expect(screening).toHaveBeenCalledWith(message);
	});

	it("the link was deleted: the guest is sent away at once", () => {
		const gone = vi.fn();
		connectShareLink("t", { gone });
		latest().open();
		latest().send({ type: "revoked" });
		expect(gone).toHaveBeenCalledOnce();
		expect(latest().close).toHaveBeenCalled();
	});

	it.each([401, 404, 410])("the server refuses with %i: sent away", async (status) => {
		const gone = vi.fn();
		connectShareLink("t", { gone });
		fetchStatus = status;
		latest().refuse();
		await vi.waitFor(() => expect(gone).toHaveBeenCalledOnce());
	});

	it.each([502, "offline"] as const)(
		"%s (a deploy, no network): not sent away, tries again later",
		async (status) => {
			const gone = vi.fn();
			connectShareLink("t", { gone });
			fetchStatus = status;
			latest().refuse();
			await vi.advanceTimersByTimeAsync(SHARE_RETRY_MS);
			expect(gone).not.toHaveBeenCalled();
			expect(FakeEventSource.instances).toHaveLength(2);
		},
	);

	it("closed by the view: nothing more happens", async () => {
		const gone = vi.fn();
		const link = connectShareLink("t", { gone });
		link.close();
		latest().send({ type: "revoked" });
		await vi.advanceTimersByTimeAsync(SHARE_RETRY_MS);
		expect(gone).not.toHaveBeenCalled();
	});
});
