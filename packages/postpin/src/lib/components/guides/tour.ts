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
	 * - "signal": by itself, once the page reports that the user did it (`signalGuide`, e.g. a marker
	 *   was created): for what a click alone doesn't tell (typing, saving, a choice in a popover)
	 * - "done": the completion card, the last step: no element, a centered card with "Done"
	 */
	advance: "next" | "click" | "appears" | "signal" | "done";
	/** The positive feedback once the step is done ("✓" is added) */
	feedback?: string;
	/** No element: a centered card (like the completion card, but with Next) */
	centered?: boolean;
	/** The label of the Next button (default "Next") */
	nextLabel?: string;
	/** Left out when this is true as the tour gets to it (e.g. already on the page it leads to) */
	skipIf?: () => boolean;
	/**
	 * Its element may not be there for good (a role or setting doesn't have it): then it's left
	 * out. For a step left out because of what the user did, use `skipIf` with that state: an
	 * element missing for a moment would leave the step out too.
	 */
	optional?: boolean;
	/**
	 * Its element comes after a navigation: it waits for it instead of going back to an earlier
	 * step while the page loads
	 */
	waitForElement?: boolean;
	/** The highlighted element is only explained, not used: clicks on it are blocked too */
	inert?: boolean;
	/**
	 * Keys that work anywhere on this step, not only in the highlighted element: the page's own
	 * shortcuts for what the step asks (e.g. M to add a marker, space to play), as `event.key`.
	 * Each one is named in the text with `key()`, so the user sees it (rule 14).
	 */
	keys?: string[];
}

/**
 * What the user does on a step, shown the same way in every tour (docs/guides/README.md, rule 16):
 * look (only Next), try (the element works, Next goes on) or act (the element is the way on, no
 * Next). The completion card is none of them.
 */
export type StepKind = "look" | "try" | "act" | "done";

export function stepKind(step: Pick<TourStep, "advance" | "inert" | "centered">): StepKind {
	if (step.advance === "done") return "done";
	if (step.advance === "click" || step.advance === "appears" || step.advance === "signal") {
		return "act";
	}
	// a centered card has no element to try
	return step.inert || step.centered ? "look" : "try";
}

/** Stands for the guide button in a step's text; shown as the real icon in the tour style */
export const GUIDE_BUTTON_TOKEN = "{guide-button}";

/**
 * Icons a step text can show inline, as the user sees them on the button it talks about (rule 14
 * in docs/guides/README.md). The components are in `step-icons.ts`.
 */
export const STEP_ICONS = [
	"play",
	"pause",
	"diamond-plus",
	"locate",
	"chevron-down",
	"message-square-reply",
	"send",
	"plus",
	"share-arrow",
	"copy",
	"move-horizontal",
	"chevrons-up-down",
	"user-group",
] as const;
export type StepIcon = (typeof STEP_ICONS)[number];

/** The icon `name` (lucide, or `share-arrow`) in a step's text, e.g. `Add a marker with ${icon("diamond-plus")}` */
export const icon = (name: StepIcon) => `{icon:${name}}`;

/**
 * A key in a step's text, shown as a key cap: `key("M")`, `key("Space")`, `key("⌥")`. Every key a
 * step lets through (`keys`) is named this way, so keys look the same in every guide.
 */
export const key = (label: string) => `{key:${label}}`;

/** How a key of `keys` (an `event.key`) is labeled in a text: "m" → "M", " " → "Space" */
export function keyLabel(eventKey: string): string {
	if (eventKey === " ") return "Space";
	if (eventKey === "Alt") return "⌥";
	return eventKey.length === 1 ? eventKey.toUpperCase() : eventKey;
}

export type StepTextPart = string | { icon: StepIcon | "guide-button" } | { key: string };

/** The text split around the guide button, the icons and the keys, for rendering them in between */
export function splitStepText(text: string): StepTextPart[] {
	const parts: StepTextPart[] = [];
	let last = 0;
	for (const match of text.matchAll(/\{(guide-button|icon:([a-z-]+)|key:([^{}]+))\}/g)) {
		if (match[3] !== undefined) {
			parts.push(text.slice(last, match.index), { key: match[3] });
			last = match.index + match[0].length;
			continue;
		}
		const name = match[2] ?? "guide-button";
		// unknown names stay text: a typo shows up instead of vanishing
		if (name !== "guide-button" && !(STEP_ICONS as readonly string[]).includes(name)) continue;
		parts.push(text.slice(last, match.index));
		parts.push({ icon: name as StepIcon | "guide-button" });
		last = match.index + match[0].length;
	}
	parts.push(text.slice(last));
	return parts.filter((p) => p !== "");
}

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
	/** Only on wide screens (at least 1024px): what it explains isn't there on phones */
	desktopOnly?: boolean;
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

export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * What can be seen of an element: its rect cut to every container that clips it (`clips`, e.g.
 * the scrolling timeline lanes), or null when it is scrolled out of view
 */
export function visibleRect(rect: Rect, clips: Rect[]): Rect | null {
	let left = rect.left;
	let top = rect.top;
	let right = rect.left + rect.width;
	let bottom = rect.top + rect.height;
	for (const clip of clips) {
		left = Math.max(left, clip.left);
		top = Math.max(top, clip.top);
		right = Math.min(right, clip.left + clip.width);
		bottom = Math.min(bottom, clip.top + clip.height);
	}
	if (right <= left || bottom <= top) return null;
	return { left, top, width: right - left, height: bottom - top };
}

/** In the top layer (a modal dialog, an open popover): nothing below it in the page clips it */
const TOP_LAYER = "dialog:modal, :popover-open";

/** The rects of the element's ancestors that clip it (overflow other than visible) */
export function clipRects(el: Element): Rect[] {
	const clips: Rect[] = [];
	if (el.matches(TOP_LAYER)) return clips;
	let position = getComputedStyle(el).position;
	for (let parent = el.parentElement; parent; parent = parent.parentElement) {
		// fixed escapes every ancestor's overflow, absolute those below its containing block
		if (position === "fixed") break;
		const style = getComputedStyle(parent);
		if (position === "absolute" && style.position === "static") continue;
		if (style.overflowX !== "visible" || style.overflowY !== "visible") {
			clips.push(parent.getBoundingClientRect());
		}
		if (parent.matches(TOP_LAYER)) break;
		position = style.position;
	}
	return clips;
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
