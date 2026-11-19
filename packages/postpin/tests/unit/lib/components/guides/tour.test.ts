import { describe, expect, it } from "vitest";
import { fallbackStep, placeCard } from "#lib/components/guides/tour.ts";
import { shareLinkTour } from "#lib/components/guides/tours/share-link.ts";
import { GUIDE_IDS } from "#lib/guides.ts";

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

describe("share-link tour", () => {
	it("is a known guide with unique step ids", () => {
		expect(GUIDE_IDS).toContain(shareLinkTour.guideId);
		const ids = shareLinkTour.steps.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("ends with exactly one completion card, as its last step", () => {
		const done = shareLinkTour.steps.filter((s) => s.advance === "done");
		expect(done).toHaveLength(1);
		expect(shareLinkTour.steps.at(-1)).toBe(done[0]);
	});

	it("never goes on by itself into the completion card", () => {
		// "appears" waits for the next step's element; the completion card has none
		const beforeLast = shareLinkTour.steps.at(-2)!;
		expect(beforeLast.advance).not.toBe("appears");
	});
});
