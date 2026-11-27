import { getContext, setContext } from "svelte";
import { undoMarkers, redoMarkers } from "./markers.remote.ts";

type Direction = "undo" | "redo";

export interface HistoryNotice {
	text: string;
	/** The export the step was on, when it isn't the open one */
	link?: { href: string; name: string };
	tone: "info" | "warning";
}

/**
 * ⌘Z / ⌘⇧Z on the review page. The history itself lives on the server, per user (or share guest),
 * so it spans exports and browser windows; this only runs the steps in order and reports them.
 *
 * Saves still on their way must land before an undo, or it would take back the wrong step: marker
 * changes register with `track`, editors with pending edits with `onflush`.
 */
export class MarkerHistory {
	/** Bumped after every undo and redo: open editors start over from the server's values */
	revision = $state(0);
	notice = $state<HistoryNotice | null>(null);
	/** A step whose markers were changed since: undo it anyway? */
	question = $state<{ text: string; answer: (yes: boolean) => void } | null>(null);

	// Not state: nothing renders them, only #settle reads them
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#pending = new Set<Promise<unknown>>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#flushes = new Set<() => void>();
	#queue: Promise<unknown> = Promise.resolve();
	#noticeTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private context: () => { shareToken?: string; exportId: string }) {}

	/** A marker change on its way to the server; returns it unchanged */
	track<T>(promise: Promise<T>): Promise<T> {
		this.#pending.add(promise);
		const done = () => this.#pending.delete(promise);
		promise.then(done, done);
		return promise;
	}

	/** Called before an undo to send pending edits right away (an editor's debounced autosave) */
	onflush(flush: () => void) {
		this.#flushes.add(flush);
		return () => this.#flushes.delete(flush);
	}

	undo() {
		return this.#step("undo");
	}

	redo() {
		return this.#step("redo");
	}

	/** One at a time: pressing ⌘Z three times quickly undoes three steps, in order */
	#step(direction: Direction) {
		const next = this.#queue.then(() => this.#run(direction));
		this.#queue = next.catch(() => {});
		return next;
	}

	async #settle() {
		for (const flush of this.#flushes) flush();
		// A save that finishes may start the next queued one, so look again until none is left
		while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
	}

	async #run(direction: Direction) {
		await this.#settle();
		const { shareToken } = this.context();
		const call = direction === "undo" ? undoMarkers : redoMarkers;
		const verb = direction === "undo" ? "Undo" : "Redo";
		try {
			let result = await call({ shareToken });
			if (result.status === "conflict") {
				const changed = result.count === 1 ? "1 marker was" : `${result.count} markers were`;
				const yes = await this.#ask(
					`${changed} changed by someone else since. ${verb} “${result.label}” anyway?`,
				);
				if (!yes) return;
				result = await call({ shareToken, force: true });
			}
			switch (result.status) {
				case "empty":
					this.#show({ text: `Nothing to ${direction}`, tone: "info" });
					return;
				case "expired":
					this.#show({
						text: `“${result.label}” can't be ${direction === "undo" ? "undone" : "redone"} any more`,
						tone: "warning",
					});
					return;
				case "conflict":
					return;
				case "done": {
					this.revision++;
					const elsewhere = result.exports.find((e) => e.id !== this.context().exportId);
					const here = result.exports.some((e) => e.id === this.context().exportId);
					this.#show({
						text: `${direction === "undo" ? "Undid" : "Redid"}: ${result.label}`,
						tone: "info",
						...(!here &&
							elsewhere?.href && { link: { href: elsewhere.href, name: elsewhere.name } }),
					});
				}
			}
		} catch (e) {
			this.#show({ text: `Could not ${direction}: ${(e as Error).message}`, tone: "warning" });
		}
	}

	#ask(text: string) {
		return new Promise<boolean>((resolve) => {
			this.question = {
				text,
				answer: (yes) => {
					this.question = null;
					resolve(yes);
				},
			};
		});
	}

	#show(notice: HistoryNotice) {
		clearTimeout(this.#noticeTimer);
		this.notice = notice;
		this.#noticeTimer = setTimeout(() => (this.notice = null), notice.link ? 8000 : 4000);
	}
}

const KEY = Symbol("marker-history");

export function setMarkerHistory(history: MarkerHistory) {
	setContext(KEY, history);
}

/** Undefined outside a review (e.g. a marker editor rendered on its own) */
export function useMarkerHistory(): MarkerHistory | undefined {
	return getContext<MarkerHistory | undefined>(KEY);
}
