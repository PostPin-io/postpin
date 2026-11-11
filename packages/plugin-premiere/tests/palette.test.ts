import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIP_PALETTE } from "../src/premiere/palette";

// The enum is only in the type definitions, at runtime it lives in Premiere
function colorLabelEnum(): string[] {
	const dts = readFileSync(
		new URL("../node_modules/@adobe/premierepro/src/premierepro.d.ts", import.meta.url),
		"utf-8",
	);
	const body = dts.match(/enum ProjectItemColorLabel \{([^}]*)\}/)?.[1];
	if (!body) throw new Error("ProjectItemColorLabel not found");
	return body
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
}

describe("CLIP_PALETTE", () => {
	it("is in the order of ProjectItemColorLabel, so getColorLabelIndex() indexes it", () => {
		expect(CLIP_PALETTE.map((c) => c.name.toUpperCase())).toEqual(colorLabelEnum());
	});

	it("has a six digit hex color for every label", () => {
		for (const color of CLIP_PALETTE) expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
	});
});
