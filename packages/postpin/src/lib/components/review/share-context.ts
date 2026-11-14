import { getContext, setContext } from "svelte";

/** Set on a share link: the same view, limited to what the link shows */
export type ShareContext = {
	token: string;
	exportName: string;
	guestName: string | null;
	note: string | null;
	timelinePanelVisible: boolean;
	markerPanelVisible: boolean;
	/** A screening link: the guest sits in the room, so their own player starts muted */
	screening: boolean;
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
