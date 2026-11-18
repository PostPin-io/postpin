import { getContext, setContext } from "svelte";
import type { ScreeningMessage } from "#lib/components/screening/screening-live.ts";

/** Set on a share link: the same view, limited to what the link shows */
export type ShareContext = {
	token: string;
	exportName: string;
	guestName: string | null;
	note: string | null;
	timelinePanelVisible: boolean;
	markerPanelVisible: boolean;
	/**
	 * A screening link: while its screening runs, the guest has no video and their playhead
	 * follows the presenter's. Otherwise it is an ordinary share link.
	 */
	screening: boolean;
	/** Whether the screening ran when the page loaded; the stream says from then on */
	live: ScreeningMessage | null;
};

const KEY = Symbol("share");

/** ExportReview: makes `share` available to everything inside (a getter, so it stays reactive) */
export function setShareContext(get: () => ShareContext | undefined) {
	setContext(KEY, get);
}

/**
 * Call during component init, read the result in $derived:
 *   const getShare = useShare();
 *   const share = $derived(getShare());
 * Outside a share view (team export page) it returns undefined.
 */
export function useShare(): () => ShareContext | undefined {
	const get = getContext<(() => ShareContext | undefined) | undefined>(KEY);
	return () => get?.();
}
