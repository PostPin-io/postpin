/**
 * What the guides know in this tab ahead of the server: GuideHost, the guide buttons and the
 * PostPin Guides page share it.
 */
import { GuideStatus } from "@postpin-io/shared/db/enums";
import type { GuideId } from "#lib/guides.ts";
import type { GuideProgressEntry } from "./guides.remote.ts";

export const guideState = $state<{
	/** Done or skipped here: gone at once, without waiting for the server */
	ended: Partial<Record<GuideId, GuideStatus>>;
	/** Started by hand (guide button, PostPin Guides page): runs even while guides are off */
	requested: GuideId | null;
	/** What the requested guide starts with, e.g. the program the plugin question was answered with */
	requestedWith: Record<string, string> | null;
	/** Guides on or off, as just switched here (null: the stored setting counts) */
	enabled: boolean | null;
	/** The guide on screen, set by GuideHost: guide buttons hide meanwhile */
	running: GuideId | null;
}>({ ended: {}, requested: null, requestedWith: null, enabled: null, running: null });

/** Another user signed in (in the same tab): nothing of the last one may carry over */
export function resetGuideState() {
	guideState.ended = {};
	guideState.requested = null;
	guideState.requestedWith = null;
	guideState.enabled = null;
	guideState.running = null;
}

type Progress = Partial<Record<GuideId, GuideProgressEntry>>;

export const statusOf = (progress: Progress, id: GuideId) =>
	guideState.ended[id] ?? progress[id]?.status;

/** Never started, or started and not finished */
export const isOpen = (progress: Progress, id: GuideId) => {
	const status = statusOf(progress, id);
	return status === undefined || status === GuideStatus.STARTED;
};

/** Starts a guide by hand: it runs from its first step */
export function requestGuide(id: GuideId, startWith?: Record<string, string>) {
	delete guideState.ended[id];
	guideState.requested = id;
	guideState.requestedWith = startWith ?? null;
}

export function endGuide(id: GuideId, status: GuideStatus) {
	guideState.ended[id] = status;
	if (guideState.requested === id) {
		guideState.requested = null;
		guideState.requestedWith = null;
	}
}

/** Once the server agrees, its word counts again (so a restart on the guides page works) */
export function syncEnded(progress: Progress) {
	for (const [id, status] of Object.entries(guideState.ended) as [GuideId, GuideStatus][]) {
		if (progress[id]?.status === status) delete guideState.ended[id];
	}
}
