import { getCategories, getMarkers, getResponses } from "./markers.remote.ts";
import { markersKey } from "./marker-scope.ts";

type StreamEvent =
	| { type: "markers"; exportId: string }
	| { type: "responses"; exportId: string; markerId: string }
	| { type: "categories"; projectId: string }
	| { type: "resync" };

/** Collect events briefly: a bulk paste or a plugin push should reload once, not 500 times */
const DEBOUNCE_MS = 150;

/**
 * Keeps the export's markers in sync with other tabs and users. Call during component init.
 * Your own writes refresh themselves already; the extra reload from their echo is cheap.
 */
export function liveMarkers(
	params: () => { exportId: string; shareToken?: string; projectId?: string; enabled: boolean },
) {
	$effect(() => {
		const { exportId, shareToken, projectId, enabled } = params();
		if (!enabled) return;

		const key = markersKey(exportId, shareToken);
		let markers = false;
		let categories = false;
		// plain list, not state: only flush reads it
		let responses: string[] = [];
		let timer: ReturnType<typeof setTimeout> | undefined;

		const flush = () => {
			timer = undefined;
			const jobs: Promise<unknown>[] = [];
			if (markers || categories) jobs.push(getMarkers(key).refresh());
			if (categories && projectId && !shareToken) jobs.push(getCategories(projectId).refresh());
			const unique = responses.filter((id, i) => responses.indexOf(id) === i);
			for (const id of unique) jobs.push(getResponses(id).refresh());
			markers = categories = false;
			responses = [];
			void Promise.allSettled(jobs);
		};
		const schedule = () => (timer ??= setTimeout(flush, DEBOUNCE_MS));

		const url =
			`/live/exports/${encodeURIComponent(exportId)}` +
			(shareToken ? `?share=${encodeURIComponent(shareToken)}` : "");
		const source = new EventSource(url);

		// Events are lost while disconnected: reload everything after every reconnect
		let opened = false;
		source.addEventListener("open", () => {
			if (opened) {
				markers = categories = true;
				schedule();
			}
			opened = true;
		});

		source.addEventListener("message", (e: MessageEvent<string>) => {
			let event: StreamEvent;
			try {
				event = JSON.parse(e.data);
			} catch {
				return;
			}
			switch (event.type) {
				case "markers":
					markers = true;
					break;
				case "responses":
					// the marker shows how many responses it has
					markers = true;
					responses.push(event.markerId);
					break;
				case "categories":
				case "resync":
					categories = true;
					break;
			}
			schedule();
		});

		return () => {
			clearTimeout(timer);
			source.close();
		};
	});
}
