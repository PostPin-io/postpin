// docs/guides/tours/marker-ranges.md: keep both in step
import { findAnchor, icon, key, type TourDefinition } from "../tour.ts";

/**
 * Shapes a marker in time: moved on the timeline, stretched into a range, start and end typed to
 * the frame, and in and out points as the fast way. On a marker the user adds in the tour, so a
 * reviewer never changes someone else's.
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
			waitForElement: true,
			keys: ["m", "M"],
		},
		{
			id: "show-timeline",
			title: "Show the timeline",
			text: `Markers are moved on the timeline. Show it with ${icon("chevrons-up-down")}.`,
			advance: "click",
			// its button is only there while the timeline is hidden
			skipIf: () => !findAnchor("marker-ranges", "show-timeline"),
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
			text: `Turn it into a range with ${icon("move-horizontal")}. Or hold ${key("⌥")} while you drag a marker.`,
			advance: "click",
			// left out when it is a range already (⌥-dragged, or made from in and out points)
			optional: true,
		},
		{
			id: "end",
			title: "Where it stops",
			text: `Hold ${key("⌥")} and drag the end of the range to where the passage stops. Without ${key("⌥")} it moves the whole range.`,
			advance: "signal",
			// ⌥ turns the edge into a handle; let the key through so the cursor shows it
			keys: ["Alt"],
			feedback: "Your first range",
		},
		{
			id: "expand",
			title: "Open your marker",
			text: `Open your marker with ${icon("chevron-down")}. Its start and end are in there.`,
			advance: "click",
			// left out when it is open already
			optional: true,
		},
		{
			id: "timecode",
			title: "Exact to the frame",
			text: `Click the timecode, type the exact start and press ${key("Enter")}.`,
			advance: "signal",
		},
		{
			id: "range-end",
			title: "Start and end",
			text: "Switch between start and end with the triangle. The end is typed the same way.",
			advance: "next",
			// only a range has an end to switch to
			optional: true,
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
			text: "Your NLE gets ranges as markers with a duration. Restart this tour under PostPin Guides.",
			advance: "done",
		},
	],
};
