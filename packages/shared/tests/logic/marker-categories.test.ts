import { describe, expect, it } from "vitest";
import { markerCategory, RESOLVE_MARKER_COLORS } from "../../src/logic/marker-categories.ts";

describe("markerCategory", () => {
	it.each([
		["Resolve", "Blue", { name: "Resolve Blue", color: RESOLVE_MARKER_COLORS.Blue }],
		["Resolve", "Cocoa", { name: "Resolve Cocoa", color: "#80594a" }],
		["Avid", "RED", { name: "Avid Red", color: "#ff0000" }],
		["Final Cut", "To-do", { name: "Final Cut To-do", color: "#ef4444" }],
		["Final Cut", "Chapter", { name: "Final Cut Chapter", color: "#f97316" }],
	] as const)("%s %s", (host, label, expected) => {
		expect(markerCategory(host, label)).toEqual(expected);
	});

	it("a color it doesn't know still gets a category, in blue", () => {
		expect(markerCategory("Avid", "ORANGE")).toEqual({ name: "Avid Orange", color: "#3b82f6" });
	});
});
