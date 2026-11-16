import { describe, expect, it } from "vitest";
import {
	CATEGORY_PRESETS,
	categoryPreset,
	DEFAULT_CATEGORIES,
} from "../../src/logic/category-presets.ts";
import { markerCategory, RESOLVE_MARKER_COLORS } from "../../src/logic/marker-categories.ts";

describe("CATEGORY_PRESETS", () => {
	it.each(CATEGORY_PRESETS.map((p) => [p.id, p] as const))(
		"%s has unique names and six digit hex colors",
		(_id, preset) => {
			const names = preset.categories.map((c) => c.name);
			expect(new Set(names).size).toBe(names.length);
			for (const c of preset.categories) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
		},
	);

	it("Resolve has every marker color under the name its markers land in", () => {
		const { categories } = categoryPreset("resolve");
		expect(categories).toHaveLength(Object.keys(RESOLVE_MARKER_COLORS).length);
		for (const color of Object.keys(RESOLVE_MARKER_COLORS)) {
			expect(categories).toContainEqual(markerCategory("Resolve", color));
		}
	});

	it("Avid and Final Cut match the categories of imported cut lists", () => {
		expect(categoryPreset("avid").categories).toContainEqual(markerCategory("Avid", "RED"));
		expect(categoryPreset("final-cut").categories).toContainEqual(
			markerCategory("Final Cut", "To-do"),
		);
	});

	it("Premiere names its categories like the plugin, with its host name", () => {
		expect(categoryPreset("premiere").categories).toContainEqual({
			name: "Premiere Pro Red",
			color: "#e0474c",
		});
	});

	it("a new project starts with the PostPin preset", () => {
		expect(DEFAULT_CATEGORIES).toBe(categoryPreset("postpin").categories);
		expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual(
			expect.arrayContaining(["QC", "VFX", "Music", "Important"]),
		);
	});
});
