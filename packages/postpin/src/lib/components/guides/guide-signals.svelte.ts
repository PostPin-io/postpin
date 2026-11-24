/**
 * The page tells a guide what the user did, for steps that wait for it (`advance: "signal"`):
 * a marker created, a reply sent. Only the time is kept; a step counts what came after it began.
 */
import type { GuideId } from "#lib/guides.ts";

const signals = $state<Record<string, number>>({});

export function signalGuide(guideId: GuideId, stepId: string) {
	signals[`${guideId}/${stepId}`] = performance.now();
}

/** When the page last reported this step, 0 if never */
export const signaledAt = (guideId: GuideId, stepId: string) =>
	signals[`${guideId}/${stepId}`] ?? 0;
