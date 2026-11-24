import { describe, expect, it } from "vitest";
import { matchesGuide } from "../../../src/routes/(root)/guides/filter.ts";

const guide = {
	title: "Share links",
	description: "Share an export with people without an account.",
};

describe("matchesGuide", () => {
	it("matches everything without a query", () => {
		expect(matchesGuide(guide, "")).toBe(true);
		expect(matchesGuide(guide, "   ")).toBe(true);
	});

	it("searches title and description, ignoring case", () => {
		expect(matchesGuide(guide, "SHARE")).toBe(true);
		expect(matchesGuide(guide, "account")).toBe(true);
		expect(matchesGuide(guide, "upload")).toBe(false);
	});

	it("needs every word, in any order", () => {
		expect(matchesGuide(guide, "export link")).toBe(true);
		expect(matchesGuide(guide, "link upload")).toBe(false);
	});
});
