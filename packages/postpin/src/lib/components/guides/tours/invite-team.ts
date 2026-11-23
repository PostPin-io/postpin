// docs/guides/tours/invite-team.md: keep both in step
import type { TourDefinition } from "../tour.ts";

export const inviteTeamTour: TourDefinition = {
	guideId: "invite-team",
	steps: [
		{
			id: "invite",
			title: "Invite by e-mail",
			text: "Invite people into your organization by e-mail.",
			advance: "next",
		},
		{
			id: "roles",
			title: "Their role",
			text: "Reviewer, Member or Admin: each can do more than the one before.",
			advance: "next",
			inert: true,
		},
		{
			id: "links",
			title: "Invite links",
			text: "Or send a link: one per role. Turn it on, copy it and send it.",
			advance: "next",
		},
		{
			id: "done",
			title: "Inviting your team",
			text: "You know both ways in. Restart this tour under PostPin Guides.",
			advance: "done",
		},
	],
};
