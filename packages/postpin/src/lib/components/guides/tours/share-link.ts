// docs/guides/tours/share-link.md: keep both in step
import { icon, type TourDefinition } from "../tour.ts";

export const shareLinkTour: TourDefinition = {
	guideId: "share-link",
	steps: [
		{
			id: "open",
			title: "Share this export",
			text: `Send it to people without a PostPin account. Open the share links with ${icon("link")}.`,
			advance: "click",
		},
		{
			id: "new",
			title: "Share links",
			text: `Anyone with a link can watch and leave markers. Create one with ${icon("plus")}.`,
			advance: "appears",
		},
		{
			id: "panels",
			title: "What guests see",
			text: "Switch the timeline and marker panels on or off. The note shows in their player.",
			advance: "next",
		},
		{
			id: "expiry",
			title: "How long it works",
			text: "You can renew or revoke the link anytime.",
			advance: "next",
		},
		{
			id: "save",
			title: "Create the link",
			text: "Save it.",
			advance: "click",
		},
		{
			id: "copy",
			title: "Send it",
			text: `Copy the link with ${icon("copy")} and send it to your reviewer.`,
			advance: "click",
		},
		{
			id: "done",
			title: "Your share link is ready",
			text: "Paste it anywhere. A QR code and e-mail are right next to it. Restart this tour under PostPin Guides.",
			advance: "done",
		},
	],
};
