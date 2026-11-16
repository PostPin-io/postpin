import { describe, expect, it } from "vitest";
import { deriveTutorialStep, isWelcomeStep, type TutorialFacts } from "#lib/tutorial.ts";

const fresh: TutorialFacts = {
	completed: false,
	hasMembership: false,
	ownsOrganization: false,
	hasProject: false,
	hasTimeline: false,
	exportReady: false,
	seenMarkers: false,
	seenSharing: false,
};
const owner = { ...fresh, hasMembership: true, ownsOrganization: true };

describe("deriveTutorialStep", () => {
	it("walks a new account through part 1", () => {
		expect(deriveTutorialStep(fresh)).toBe("organization");
		expect(deriveTutorialStep(owner)).toBe("project");
		expect(deriveTutorialStep({ ...owner, hasProject: true })).toBe("timeline");
		expect(deriveTutorialStep({ ...owner, hasProject: true, hasTimeline: true })).toBe("upload");
	});

	it("continues on the review page once an export can be played", () => {
		const uploaded = { ...owner, hasProject: true, hasTimeline: true, exportReady: true };
		expect(deriveTutorialStep(uploaded)).toBe("review");
		// the two tours don't depend on each other
		expect(deriveTutorialStep({ ...uploaded, seenMarkers: true })).toBe("review");
		expect(deriveTutorialStep({ ...uploaded, seenSharing: true })).toBe("review");
	});

	it("is over once both tours were seen", () => {
		const uploaded = { ...owner, hasProject: true, hasTimeline: true, exportReady: true };
		expect(deriveTutorialStep({ ...uploaded, seenMarkers: true, seenSharing: true })).toBeNull();
	});

	it("is over when finished or skipped", () => {
		expect(deriveTutorialStep({ ...fresh, completed: true })).toBeNull();
		expect(deriveTutorialStep({ ...owner, completed: true })).toBeNull();
	});

	it("is not for people who were invited into an organization", () => {
		expect(deriveTutorialStep({ ...fresh, hasMembership: true })).toBeNull();
	});
});

describe("isWelcomeStep", () => {
	it("tells part 1 from the tours on the review page", () => {
		expect(isWelcomeStep("organization")).toBe(true);
		expect(isWelcomeStep("upload")).toBe(true);
		expect(isWelcomeStep("review")).toBe(false);
		expect(isWelcomeStep(null)).toBe(false);
	});
});
