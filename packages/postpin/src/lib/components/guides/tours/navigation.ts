// docs/guides/tours/navigation.md: keep both in step
import type { TourDefinition } from "../tour.ts";

const onDashboard = () => window.location.pathname.replace(/\/+$/, "").endsWith("/dashboard");
/** Below Tailwind's lg: the breadcrumbs show only the current level and a back button */
const onPhone = () => window.matchMedia("(max-width: 1023.98px)").matches;

export const navigationTour: TourDefinition = {
	guideId: "navigation",
	// walks from the dashboard down to an export: page changes are part of it
	spansPages: true,
	steps: [
		{
			id: "go-home",
			title: "Your dashboard",
			text: "Click here to go home, from anywhere.",
			advance: "click",
			skipIf: onDashboard,
		},
		{
			id: "home",
			title: "Your home",
			text: "It shows the organization you're in. You switch organizations in your account menu.",
			advance: "next",
			inert: true,
		},
		{
			id: "projects",
			title: "Projects",
			text: "One project per production: a film, a series, a commercial.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "new-project",
			title: "New project",
			text: "This is where you create a project.",
			advance: "next",
			optional: true,
			inert: true,
		},
		{
			id: "search",
			title: "Search",
			text: "Finds a project by name.",
			advance: "next",
			inert: true,
		},
		{
			id: "sort",
			title: "Sort",
			text: "By name, creation or last change.",
			advance: "next",
			inert: true,
		},
		{
			id: "views",
			title: "Cards or table",
			text: "Cards show thumbnails, the table is compact.",
			advance: "next",
			// not on phones: always cards there
			optional: true,
			inert: true,
		},
		{
			id: "open-project",
			title: "Open a project",
			text: "Click it to see its timelines.",
			advance: "click",
		},
		{
			id: "timelines",
			title: "Timelines",
			text: "One timeline per sequence you edit. Search, sort and views work as on the dashboard.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "new-timeline",
			title: "New timeline",
			text: "This is where you add a timeline.",
			advance: "next",
			optional: true,
			inert: true,
		},
		{
			id: "open-timeline",
			title: "Open a timeline",
			text: "Click it to see its exports.",
			advance: "click",
		},
		{
			id: "exports",
			title: "Exports",
			text: "Every render you upload is an export. Dropping a video on the page adds the next version.",
			advance: "next",
			waitForElement: true,
			inert: true,
		},
		{
			id: "open-export",
			title: "Open an export",
			text: "Click it to review it.",
			advance: "click",
		},
		{
			id: "breadcrumbs",
			title: "Where you are",
			text: "Each name takes you back up to that level.",
			advance: "next",
			waitForElement: true,
			inert: true,
			skipIf: onPhone,
		},
		{
			id: "back",
			title: "Where you are",
			text: "This takes you one level up.",
			advance: "next",
			waitForElement: true,
			inert: true,
			skipIf: () => !onPhone(),
		},
		{
			id: "switcher",
			title: "Jump sideways",
			text: "This switches to another timeline or export without going back.",
			advance: "next",
			inert: true,
		},
		{
			id: "done",
			title: "You know your way around",
			text: "Next: share an export with the button next to it.",
			advance: "done",
		},
	],
};
