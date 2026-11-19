// docs/guides/tours/postpin-guides.md: keep both in step
import type { TourDefinition } from "../tour.ts";

export const postpinGuidesTour: TourDefinition = {
	guideId: "postpin-guides",
	steps: [
		{
			id: "menu",
			title: "Guides",
			text: "PostPin explains itself with guides. You find all of them in your account menu: open it.",
			// goes on once the menu is open, however it was opened (or was already open)
			advance: "appears",
		},
		{
			id: "page",
			title: "PostPin Guides",
			text: "Here are all tutorials and tours. Start any of them again, or switch guides off if you don't need them.",
			advance: "click",
		},
		{
			id: "done",
			title: "You know your way around",
			text: "Look out for the graduation cap next to a feature: it starts a short tour about it. Once you've done a tour, its button disappears.",
			advance: "done",
		},
	],
};
