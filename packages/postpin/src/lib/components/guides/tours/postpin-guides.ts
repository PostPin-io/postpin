// docs/guides/tours/postpin-guides.md: keep both in step
import { GUIDE_BUTTON_TOKEN, type TourDefinition } from "../tour.ts";

/** Started on the PostPin Guides page itself: the way there is left out */
const onGuidesPage = () => window.location.pathname.replace(/\/+$/, "").endsWith("/guides");

export const postpinGuidesTour: TourDefinition = {
	guideId: "postpin-guides",
	steps: [
		{
			id: "welcome",
			title: "Welcome to PostPin Guides",
			text: "PostPin shows you around with tutorials and tours. This takes a minute.",
			advance: "next",
			centered: true,
			nextLabel: "Show me",
		},
		{
			id: "menu",
			title: "Your account menu",
			text: "All guides are in your account menu. Open it.",
			// goes on once the menu is open, however it was opened (or was already open)
			advance: "appears",
			skipIf: onGuidesPage,
		},
		{
			id: "page",
			title: "PostPin Guides",
			text: "Open PostPin Guides.",
			advance: "click",
			skipIf: onGuidesPage,
		},
		{
			id: "tutorials",
			title: "Tutorials",
			text: "They teach the basics step by step and start on their own when you need them.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "tours",
			title: "Tours",
			text: `They explain one feature, right where it is. Start one with ${GUIDE_BUTTON_TOKEN} next to the feature; it disappears once you're done.`,
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "start",
			title: "Start again",
			text: "Start any guide again here.",
			advance: "next",
			optional: true,
			inert: true,
		},
		{
			id: "filter",
			title: "Find a guide",
			text: "Filter by topic, or show only what you haven't completed.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "switch",
			title: "Switch guides off",
			text: "Nothing starts on its own and the guide buttons disappear. You can still start guides here.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "done",
			title: "You know your way around",
			text: `Tutorials come by themselves, tours wait for you: look out for ${GUIDE_BUTTON_TOKEN}. All guides are under PostPin Guides.`,
			advance: "done",
		},
	],
};
