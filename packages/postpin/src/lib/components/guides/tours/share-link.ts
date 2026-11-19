// docs/guides/tours/share-link.md: keep both in step
import type { TourDefinition } from "../tour.ts";

export const shareLinkTour: TourDefinition = {
	guideId: "share-link",
	steps: [
		{
			id: "open",
			title: "Share this export",
			text: "Send this export to people who don't have a PostPin account. Open the share links here.",
			advance: "click",
		},
		{
			id: "new",
			title: "Share links",
			text: "Anyone with a share link can watch this export and leave markers, without an account. Create a new link with +.",
			advance: "appears",
		},
		{
			id: "panels",
			title: "What guests see",
			text: "Choose the panels guests get: the timeline, the markers, or just the video. Click a panel to switch it on or off. The note is shown in the player.",
			advance: "next",
		},
		{
			id: "expiry",
			title: "How long it works",
			text: "Pick how long the link works. You can renew or revoke it anytime.",
			advance: "next",
		},
		{
			id: "save",
			title: "Create the link",
			text: "Save the link to create it.",
			advance: "click",
		},
		{
			id: "copy",
			title: "Send it",
			text: "Copy the link and send it to your reviewer.",
			advance: "click",
		},
		{
			id: "done",
			title: "Your share link is ready",
			text: "It's copied, paste it anywhere. Next to it you can also show a QR code or send it by e-mail. You can start this tour again under PostPin Guides in the account menu.",
			advance: "done",
		},
	],
};
