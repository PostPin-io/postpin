import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { Role } from "@postpin-io/shared/db";
import { prisma } from "#lib/server/database.ts";
import { deriveTutorialStep, TUTORIAL_SEEN_STEPS } from "#lib/tutorial.ts";

// All of these are about the signed-in user only: no target to authorize, but a session is a must
// (/_app/remote/ is a public path).
function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return user;
}

/**
 * Where the user is in the tutorial, and what they made in it. "Theirs" is the newest
 * organization they own, their newest project in it and that project's newest export (or
 * timeline, while there is no export): no reference is stored, see #lib/tutorial.ts.
 */
export const getTutorialState = query(async () => {
	const { id } = requireUser();
	const user = await prisma.user.findUniqueOrThrow({
		where: { id },
		select: {
			name: true,
			tutorialCompletedAt: true,
			tutorialSeenSteps: true,
			memberships: {
				orderBy: { createdAt: "desc" },
				select: { role: true, organization: { select: { id: true, name: true } } },
			},
		},
	});
	const organization = user.memberships.find((m) => m.role === Role.OWNER)?.organization ?? null;

	const project = organization
		? await prisma.project.findFirst({
				where: { organizationId: organization.id, creatorId: id },
				orderBy: { createdAt: "desc" },
				select: { id: true, name: true },
			})
		: null;

	// the plugin may have uploaded into a timeline of its own making: the export decides
	const exports = project
		? await prisma.export.findMany({
				where: { timeline: { projectId: project.id } },
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					name: true,
					timeline: { select: { id: true, name: true } },
					media: { select: { status: true } },
				},
			})
		: [];
	const playable = exports.filter((e) => e.media?.status === "COMPLETED");
	// the one the tutorial talks about: playable, else the newest
	const exp = playable[0] ?? exports[0] ?? null;

	const timeline =
		exp?.timeline ??
		(project
			? await prisma.timeline.findFirst({
					where: { projectId: project.id },
					orderBy: { createdAt: "desc" },
					select: { id: true, name: true },
				})
			: null);

	const step = deriveTutorialStep({
		completed: user.tutorialCompletedAt !== null,
		hasMembership: user.memberships.length > 0,
		ownsOrganization: !!organization,
		hasProject: !!project,
		hasTimeline: !!timeline,
		exportReady: playable.length > 0,
		seenMarkers: user.tutorialSeenSteps.includes("markers"),
		seenSharing: user.tutorialSeenSteps.includes("sharing"),
	});

	return {
		step,
		/** The tutorial is for people who set PostPin up themselves, not for those invited into an organization */
		eligible: user.memberships.length === 0 || !!organization,
		firstName: user.name.split(" ")[0] ?? "",
		organization,
		project,
		timeline,
		export: exp && { id: exp.id, name: exp.name, status: exp.media?.status ?? null },
		seen: {
			markers: user.tutorialSeenSteps.includes("markers"),
			sharing: user.tutorialSeenSteps.includes("sharing"),
		},
	};
});

/** A tour on the review page was seen; with the last one the tutorial is done */
export const markTutorialStep = command(v.picklist(TUTORIAL_SEEN_STEPS), async (step) => {
	const { id } = requireUser();
	const { tutorialSeenSteps } = await prisma.user.findUniqueOrThrow({
		where: { id },
		select: { tutorialSeenSteps: true },
	});
	if (tutorialSeenSteps.includes(step)) return;
	const seen = [...tutorialSeenSteps, step];
	await prisma.user.update({
		where: { id },
		data: {
			tutorialSeenSteps: seen,
			...(TUTORIAL_SEEN_STEPS.every((s) => seen.includes(s)) && {
				tutorialCompletedAt: new Date(),
			}),
		},
	});
});

/** Done, or skipped: the tutorial doesn't show up again until it is restarted */
export const finishTutorial = command(async () => {
	const { id } = requireUser();
	await prisma.user.update({ where: { id }, data: { tutorialCompletedAt: new Date() } });
});

export const restartTutorial = command(async () => {
	const { id } = requireUser();
	await prisma.user.update({
		where: { id },
		data: { tutorialCompletedAt: null, tutorialSeenSteps: [] },
	});
});
