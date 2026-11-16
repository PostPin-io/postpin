/**
 * Onboarding tutorial: from a fresh account to the first export that is ready to send, then
 * sharing it and pulling the first note back into the editing software.
 *
 * The step is derived from what exists (organization, project, timeline, export, marker), so it
 * can't drift from reality, e.g. when the plugin creates things on the side. Only what can't be
 * derived is stored on the user: the explanations they have seen and whether they are done.
 */

/**
 * Stored in User.tutorialSeenSteps: the two tours on the review page. They run side by side (the
 * marker tour on its own, sharing when the user asks for it), so neither can be derived.
 */
export const TUTORIAL_SEEN_STEPS = ["markers", "sharing"] as const;
export type TutorialSeenStep = (typeof TUTORIAL_SEEN_STEPS)[number];

/**
 * - organization, project, timeline, upload: part 1, on /welcome
 * - review: part 2, on the review page of the first export: markers and sharing
 */
export const TUTORIAL_STEPS = ["organization", "project", "timeline", "upload", "review"] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** The steps of part 1, as the step bar on /welcome shows them (after "Account") */
export const WELCOME_STEPS = ["organization", "project", "timeline", "upload"] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];

export function isWelcomeStep(step: TutorialStep | null): step is WelcomeStep {
	return !!step && (WELCOME_STEPS as readonly string[]).includes(step);
}

export interface TutorialFacts {
	/** Finished or skipped */
	completed: boolean;
	/** Member of at least one organization */
	hasMembership: boolean;
	/** Owns an organization: the tutorial is for people who set PostPin up themselves */
	ownsOrganization: boolean;
	hasProject: boolean;
	hasTimeline: boolean;
	/** An export of the project can be played */
	exportReady: boolean;
	seenMarkers: boolean;
	seenSharing: boolean;
}

/** The step the user is at, or null when the tutorial is not for them (any more) */
export function deriveTutorialStep(facts: TutorialFacts): TutorialStep | null {
	if (facts.completed) return null;
	// invited into someone else's organization: they review, the tutorial is for those who upload
	if (facts.hasMembership && !facts.ownsOrganization) return null;
	if (!facts.ownsOrganization) return "organization";
	if (!facts.hasProject) return "project";
	if (!facts.hasTimeline) return "timeline";
	if (!facts.exportReady) return "upload";
	// both tours seen: nothing left to show, even before finishTutorial stored it
	return facts.seenMarkers && facts.seenSharing ? null : "review";
}
