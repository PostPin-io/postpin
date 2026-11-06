import { describe, expect, it } from "vitest";
import { parseCategoryTag, withCategoryTag } from "../src/categoryTag.ts";

describe("parseCategoryTag", () => {
	it("reads a '#Name' first line and the description after the blank line", () => {
		expect(parseCategoryTag("#VFX\n\nFix the sky")).toEqual({
			categoryName: "VFX",
			description: "Fix the sky",
		});
	});

	it("keeps spaces inside the name and trims around it", () => {
		expect(parseCategoryTag("#  Color Grade  \n\ntext")).toEqual({
			categoryName: "Color Grade",
			description: "text",
		});
	});

	it("reads a tag without description", () => {
		expect(parseCategoryTag("#VFX")).toEqual({ categoryName: "VFX", description: "" });
	});

	it("accepts the description right after the tag line, without the blank line", () => {
		expect(parseCategoryTag("#VFX\nFix the sky")).toEqual({
			categoryName: "VFX",
			description: "Fix the sky",
		});
	});

	it("keeps later lines and blank lines of the description", () => {
		expect(parseCategoryTag("#VFX\n\nline 1\n\nline 2\n")).toEqual({
			categoryName: "VFX",
			description: "line 1\n\nline 2\n",
		});
	});

	it("handles CRLF line endings", () => {
		expect(parseCategoryTag("#VFX\r\n\r\ntext")).toEqual({
			categoryName: "VFX",
			description: "text",
		});
	});

	it.each([
		["", "an empty description"],
		["Fix the sky", "no tag"],
		["#", "a lone '#'"],
		["Fix #VFX", "a '#' later in the line"],
		["\n#VFX", "a tag on the second line"],
	])("returns no category for %j (%s) and leaves the description as is", (description) => {
		expect(parseCategoryTag(description)).toEqual({ categoryName: null, description });
	});

	it("returns no category for a '#' followed only by whitespace", () => {
		expect(parseCategoryTag("#  \n\ntext").categoryName).toBeNull();
	});
});

describe("withCategoryTag", () => {
	it("puts the tag and a blank line before the description", () => {
		expect(withCategoryTag("VFX", "Fix the sky")).toBe("#VFX\n\nFix the sky");
	});

	it("writes only the tag without a description", () => {
		expect(withCategoryTag("VFX", null)).toBe("#VFX");
		expect(withCategoryTag("VFX", "")).toBe("#VFX");
	});

	it.each(["Fix the sky", "multi\nline\n\ntext", "#not a tag, just text"])(
		"round-trips %j through parseCategoryTag",
		(description) => {
			expect(parseCategoryTag(withCategoryTag("Color Grade", description))).toEqual({
				categoryName: "Color Grade",
				description,
			});
		},
	);
});
