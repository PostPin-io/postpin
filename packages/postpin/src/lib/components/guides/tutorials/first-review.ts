// docs/guides/tutorials/first-review.md: keep both in step
import { icon, key, type TourDefinition } from "../tour.ts";

/**
 * A tutorial on the review page itself: it uses the tour engine (spotlight, card) in the tutorial
 * style. One action per step, on exactly the element it needs, and every step waits for the real
 * thing. The user works on a marker they create here, so nothing asks a reviewer to change
 * someone else's.
 */
export const firstReviewTour: TourDefinition = {
	guideId: "first-review",
	steps: [
		{
			id: "play",
			title: "Find the spot",
			text: `Start the video with ${icon("play")} and stop it with ${icon("pause")} where something should change. ${key("Space")} works too.`,
			advance: "signal",
			waitForElement: true,
			// the player's own shortcut for it
			keys: [" "],
		},
		{
			id: "add-marker",
			title: "Your first marker",
			text: `Add a marker on this frame with ${icon("diamond-plus")} or ${key("M")}.`,
			advance: "signal",
			keys: ["m", "M"],
			feedback: "Your first marker",
		},
		{
			id: "title",
			title: "Say what to change",
			text: `Type what should change, then press ${key("Enter")}.`,
			advance: "signal",
			waitForElement: true,
		},
		{
			id: "category",
			title: "Pick a category",
			text: "Categories sort the feedback, e.g. color, sound or edit. Choose one.",
			advance: "signal",
		},
		{
			id: "jump",
			title: "Jump to a marker",
			text: `Every marker in the list takes you to its frame. Jump to yours with ${icon("locate")}.`,
			advance: "signal",
		},
		{
			id: "expand",
			title: "Open the marker",
			text: `Open your marker with ${icon("chevron-down")}.`,
			advance: "click",
			// left out when it is open already
			optional: true,
		},
		{
			id: "open-responses",
			title: "Talk it through",
			text: `Every marker has its own conversation. Start it with ${icon("message-square-reply")} Respond.`,
			advance: "click",
			waitForElement: true,
		},
		{
			id: "reply",
			title: "Reply",
			text: `Write a reply and send it with ${icon("send")}. Everyone working on this export sees it.`,
			advance: "signal",
			waitForElement: true,
		},
		{
			id: "done",
			title: "You know the basics of reviewing",
			text: "Leave a marker wherever something should change. For more, look out for {guide-button} next to features, and PostPin Guides in the account menu.",
			advance: "done",
		},
	],
};
