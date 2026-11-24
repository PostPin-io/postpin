// docs/guides/tours/project-access.md: keep both in step
import { findAnchor, icon, type TourDefinition } from "../tour.ts";

export const projectAccessTour: TourDefinition = {
	guideId: "project-access",
	steps: [
		{
			id: "open",
			title: "Invitations",
			text: `Who can open this project, and who joins. Open the invitations with ${icon("user-group")}.`,
			advance: "click",
			// started from its guide button inside the dialog: it is open already
			skipIf: () => findAnchor("project-access", "add") !== null,
		},
		{
			id: "add",
			title: "Add people",
			text: "Type a name from your organization, or an e-mail address to invite someone new.",
			advance: "next",
			waitForElement: true,
		},
		{
			id: "access-tab",
			title: "Who has access",
			text: "See who can open it.",
			advance: "click",
		},
		{
			id: "grants",
			title: "People with access",
			text: "They get access to just this project or timeline.",
			advance: "next",
			inert: true,
		},
		{
			id: "links-tab",
			title: "Invite links",
			text: "Or invite with a link.",
			advance: "click",
		},
		{
			id: "invite-link",
			title: "One link per role",
			text: "Turn it on, copy it and send it. Anyone with the link joins with its role.",
			advance: "next",
		},
		{
			id: "done",
			title: "Project access",
			text: "You know how people get in. Restart this tour under PostPin Guides.",
			advance: "done",
		},
	],
};
