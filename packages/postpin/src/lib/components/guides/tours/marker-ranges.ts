// docs/guides/tours/marker-ranges.md: keep both in step
import { signaledAt } from "../guide-signals.svelte.ts";
import { findAnchor, icon, key, type TourDefinition } from "../tour.ts";

/** Whether the element of a step of this tour is on screen */
const shows = (stepId: string) => !!findAnchor("marker-ranges", stepId);

/**
 * Shapes a marker in time: moved on the timeline, stretched into a range, start and end typed to
 * the frame, and in and out points as the fast way. On the user's own marker (added in the tour,
 * or theirs at the playhead), so a reviewer never changes someone else's.
 *
 * Steps are left out by the marker's state (`skipIf`), never because an element is missing for a
 * moment (`optional`): the step after would lack its element and go back to the timeline, a loop.
 */
export const markerRangesTour: TourDefinition = {
	guideId: "marker-ranges",
	// the timeline only exists on wide screens
	desktopOnly: true,
	steps: [
		{
			id: "add-marker",
			title: "A marker to shape",
			text: `Add a marker with ${icon("diamond-plus")} or ${key("M")}. You'll move it and stretch it into a range.`,
			advance: "signal",
			// the player may still be loading
			waitForElement: true,
			keys: ["m", "M"],
		},
		{
			id: "show-timeline",
			title: "Show the timeline",
			text: `Markers are moved on the timeline. Show it with ${icon("chevrons-up-down")}.`,
			advance: "click",
			// its button is only there while the timeline is hidden
			skipIf: () => !shows("show-timeline"),
		},
		{
			id: "move",
			title: "Move it",
			text: "Drag your marker along the timeline. The video follows, so you see the frame you land on.",
			advance: "signal",
			// the timeline may still be opening; going back would add another marker
			waitForElement: true,
		},
		{
			id: "make-range",
			title: "Make it a range",
			text: `Turn it into a range with ${icon("move-horizontal")}.`,
			advance: "click",
			// a range already: its end is on the timeline (⌥-dragged, or made from in and out points)
			skipIf: () => shows("end"),
			// the editor shows the marker after its save
			waitForElement: true,
		},
		{
			id: "end",
			title: "Where it stops",
			text: `Hold ${key("⌥")} and drag the end of the range to where the passage stops. Without ${key("⌥")} it moves the whole range.`,
			advance: "signal",
			// the end was dragged already since this marker was added (⌥-drag in "move")
			skipIf: () => signaledAt("marker-ranges", "end") > signaledAt("marker-ranges", "add-marker"),
			// ⌥ turns the edge into a handle; let the key through so the cursor shows it
			keys: ["Alt"],
			feedback: "Your first range",
		},
		{
			id: "expand",
			title: "Open your marker",
			text: `Open your marker with ${icon("chevron-down")}. Its start and end are in there.`,
			advance: "click",
			// open already: its start timecode is in the list
			skipIf: () => shows("timecode"),
			// the list may re-render after the drag; filtered out, the marker isn't there: wait
			waitForElement: true,
		},
		{
			id: "timecode",
			title: "Exact to the frame",
			text: `Click the timecode, type the exact start and press ${key("Enter")}.`,
			advance: "signal",
			waitForElement: true,
		},
		{
			id: "range-end",
			title: "Start and end",
			text: "Switch between start and end with the triangle. The end is typed the same way.",
			advance: "next",
			// only a range has an end to switch to
			skipIf: () => !shows("range-end"),
		},
		{
			id: "keys",
			title: "Faster with keys",
			text: `Play with ${key("Space")}, set In with ${key("I")} and Out with ${key("O")}, then ${key("M")} adds the range.`,
			advance: "next",
			keys: [" ", "i", "I", "o", "O", "m", "M"],
		},
		{
			id: "done",
			title: "Your markers cover whole passages",
			text: `Tip: hold ${key("⌥")} while you drag a marker to pull out a range at once. Restart this tour under PostPin Guides.`,
			advance: "done",
		},
	],
};
