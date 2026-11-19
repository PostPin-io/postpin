import { describe, expect, it, vi } from "vitest";
import {
	GUIDE_BUTTON_TOKEN,
	fallbackStep,
	nextShownStep,
	placeCard,
	splitStepText,
	type TourStep,
} from "#lib/components/guides/tour.ts";
import { shareLinkTour } from "#lib/components/guides/tours/share-link.ts";
import { GUIDES, GUIDE_IDS } from "#lib/guides.ts";
import { postpinGuidesTour } from "#lib/components/guides/tours/postpin-guides.ts";
import { navigationTour } from "#lib/components/guides/tours/navigation.ts";

const viewport = { width: 1000, height: 800 };
const card = { width: 300, height: 200 };

describe("placeCard", () => {
	it("goes below the element, centered on it", () => {
		expect(placeCard({ top: 100, bottom: 140, left: 400, width: 200 }, card, viewport)).toEqual({
			top: 152,
			left: 350,
		});
	});

	it("goes above when there is no room below", () => {
		expect(placeCard({ top: 600, bottom: 640, left: 400, width: 200 }, card, viewport).top).toBe(
			388,
		);
	});

	it("stays on screen at the edges", () => {
		expect(placeCard({ top: 100, bottom: 140, left: 0, width: 20 }, card, viewport).left).toBe(8);
		expect(placeCard({ top: 100, bottom: 140, left: 990, width: 10 }, card, viewport).left).toBe(
			692,
		);
	});

	it("is pushed into view when it fits neither below nor above", () => {
		const tall = { width: 300, height: 700 };
		expect(placeCard({ top: 300, bottom: 340, left: 400, width: 200 }, tall, viewport).top).toBe(
			92,
		);
	});
});

describe("fallbackStep", () => {
	it("is the latest earlier step whose element is there", () => {
		expect(fallbackStep(4, (i) => i === 0 || i === 1)).toBe(1);
	});

	it("is none when no earlier element is there", () => {
		expect(fallbackStep(3, () => false)).toBeNull();
		expect(fallbackStep(0, () => true)).toBeNull();
	});
});

const TOURS = [shareLinkTour, postpinGuidesTour, navigationTour];

describe.each(TOURS.map((t) => [t.guideId, t] as const))("%s tour", (_, tour) => {
	it("is a known tour with unique step ids", () => {
		expect(GUIDES.find((g) => g.id === tour.guideId)?.type).toBe("tour");
		const ids = tour.steps.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("ends with exactly one completion card, as its last step", () => {
		const done = tour.steps.filter((s) => s.advance === "done");
		expect(done).toHaveLength(1);
		expect(tour.steps.at(-1)).toBe(done[0]);
	});

	it("never goes on by itself into the completion card", () => {
		// "appears" waits for the next step's element; the completion card has none
		expect(tour.steps.at(-2)!.advance).not.toBe("appears");
	});
});

describe("guide registry", () => {
	it("starts tutorials and the tour about guides on their own, all other tours by hand", () => {
		for (const guide of GUIDES) {
			const automatic = guide.type === "tutorial" || guide.id === "postpin-guides";
			expect(guide.trigger, guide.id).toBe(automatic ? "automatic" : "manual");
		}
	});

	it("has a guide id for every tour definition", () => {
		for (const tour of TOURS) expect(GUIDE_IDS).toContain(tour.guideId);
	});
});

describe("nextShownStep", () => {
	const step = (id: string, skip = false): TourStep => ({
		id,
		title: id,
		text: "",
		advance: "next",
		skipIf: () => skip,
	});

	it("is the step itself when it isn't left out", () => {
		expect(nextShownStep([step("a"), step("b")], 1)).toBe(1);
	});

	it("goes past steps that are left out", () => {
		expect(nextShownStep([step("a"), step("b", true), step("c", true), step("d")], 1)).toBe(3);
	});

	it("is null at the end", () => {
		expect(nextShownStep([step("a"), step("b", true)], 1)).toBeNull();
		expect(nextShownStep([step("a")], 1)).toBeNull();
	});
});

describe("splitStepText", () => {
	it("splits around every guide button", () => {
		expect(splitStepText(`look for ${GUIDE_BUTTON_TOKEN} next to it`)).toEqual([
			"look for ",
			" next to it",
		]);
		expect(splitStepText("no icon")).toEqual(["no icon"]);
	});
});

describe("postpin-guides tour", () => {
	const byId = (id: string) => postpinGuidesTour.steps.find((s) => s.id === id)!;

	it("starts with a centered welcome card", () => {
		const first = postpinGuidesTour.steps[0]!;
		expect(first.id).toBe("welcome");
		expect(first.centered).toBe(true);
		expect(first.advance).toBe("next");
	});

	it("only explains the PostPin Guides page, so nothing there starts another guide", () => {
		for (const id of ["tutorials", "tours", "start", "filter", "switch"]) {
			expect(byId(id).inert, id).toBe(true);
		}
	});

	it("shows the guide button in the explanation of tours", () => {
		expect(byId("tours").text).toContain(GUIDE_BUTTON_TOKEN);
	});
});
describe("navigation tour", () => {
	const byId = (id: string) => navigationTour.steps.find((s) => s.id === id)!;

	it("leads through several pages, so leaving a page doesn't pause it", () => {
		expect(navigationTour.spansPages).toBe(true);
	});

	it("only the open steps are clicked, everything explained is inert", () => {
		for (const step of navigationTour.steps) {
			if (step.advance === "done") continue;
			const acts = step.id === "go-home" || step.id.startsWith("open-");
			expect(step.advance === "click", step.id).toBe(acts);
			expect(!!step.inert, step.id).toBe(!acts);
		}
	});

	it("waits for the page after every step that navigates", () => {
		const ids = navigationTour.steps.map((s) => s.id);
		for (const open of ["open-project", "open-timeline", "open-export"]) {
			expect(navigationTour.steps[ids.indexOf(open) + 1]!.waitForElement, open).toBe(true);
		}
	});

	it("shows exactly one breadcrumb variant per screen size", () => {
		const desktop = byId("breadcrumbs").skipIf!;
		const phone = byId("back").skipIf!;
		for (const matches of [true, false]) {
			vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
			expect(desktop() !== phone()).toBe(true);
		}
		vi.unstubAllGlobals();
	});
});
