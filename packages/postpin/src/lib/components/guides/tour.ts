import type { GuideId } from "#lib/guides.ts";

/** One popover of a tour, on the element with `data-guide="<guide-id>/<id>"` */
export interface TourStep {
	id: string;
	title: string;
	text: string;
	/**
	 * How the step is done:
	 * - "next": the Next button
	 * - "click": the user clicks the highlighted element (it does what it always does)
	 * - "appears": by itself, as soon as the next step's element shows up (e.g. a form opening)
	 * - "done": the completion card, the last step: no element, a centered card with "Done"
	 */
	advance: "next" | "click" | "appears" | "done";
	/** The positive feedback once the step is done ("✓" is added) */
	feedback?: string;
	/** No element: a centered card (like the completion card, but with Next) */
	centered?: boolean;
	/** The label of the Next button (default "Next") */
	nextLabel?: string;
	/** Left out when this is true as the tour gets to it (e.g. already on the page it leads to) */
	skipIf?: () => boolean;
	/** Its element may not be there (e.g. a list that's filtered empty): then it's left out */
	optional?: boolean;
	/**
	 * Its element comes after a navigation: it waits for it instead of going back to an earlier
	 * step while the page loads
	 */
	waitForElement?: boolean;
	/** The highlighted element is only explained, not used: clicks on it are blocked too */
	inert?: boolean;
}

/** Stands for the guide button in a step's text; shown as the real icon in the tour style */
export const GUIDE_BUTTON_TOKEN = "{guide-button}";

/** The text split around GUIDE_BUTTON_TOKEN, for rendering the icon in between */
export const splitStepText = (text: string) => text.split(GUIDE_BUTTON_TOKEN);

/** The next step at or after `from` that isn't left out, or null at the end */
export function nextShownStep(steps: TourStep[], from: number): number | null {
	for (let i = from; i < steps.length; i++) if (!steps[i]!.skipIf?.()) return i;
	return null;
}

export interface TourDefinition {
	guideId: GuideId;
	steps: TourStep[];
	/**
	 * The tour leads through several pages (its "click" steps navigate). Otherwise a tour
	 * started from a guide button pauses when the user leaves the page.
	 */
	spansPages?: boolean;
}

/**
 * The step's element on screen. There may be several (e.g. the account menu on desktop and on
 * phones); hidden ones (other screen sizes, a closed menu) are as good as not there.
 */
export function findAnchor(guideId: GuideId, stepId: string): HTMLElement | null {
	// ~=: one element can serve several steps (data-guide="a/one a/two")
	const all = document.querySelectorAll<HTMLElement>(`[data-guide~="${guideId}/${stepId}"]`);
	for (const el of all) {
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		// a closed dropdown keeps its size, it's only invisible
		if (el.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) === false)
			continue;
		return el;
	}
	return null;
}

/** Below the element if it fits, else above; never off screen */
export function placeCard(
	anchor: { top: number; bottom: number; left: number; width: number },
	card: { width: number; height: number },
	viewport: { width: number; height: number },
	gap = 12,
	margin = 8,
) {
	const below = anchor.bottom + gap;
	const above = anchor.top - gap - card.height;
	const top =
		below + card.height <= viewport.height - margin
			? below
			: above >= margin
				? above
				: Math.max(margin, viewport.height - margin - card.height);
	const centered = anchor.left + anchor.width / 2 - card.width / 2;
	const left = Math.min(Math.max(margin, centered), viewport.width - margin - card.width);
	return { top, left: Math.max(margin, left) };
}

/**
 * The step to show while the current one's element is missing: the latest earlier step whose
 * element is there (e.g. the dialog was closed: back to the button that opens it), else none.
 */
export function fallbackStep(index: number, present: (i: number) => boolean): number | null {
	for (let i = index - 1; i >= 0; i--) if (present(i)) return i;
	return null;
}
