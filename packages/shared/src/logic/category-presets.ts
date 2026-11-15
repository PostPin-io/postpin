// Sets of categories a project can be filled with at once. The ones of an editing software are
// named and colored exactly like the categories its markers land in on sync ("Resolve Blue", see
// marker-categories.ts and plugin-core/src/sync.ts), so markers of both directions meet in them.

import {
	AVID_COLORS,
	FINAL_CUT_TYPES,
	PREMIERE_MARKER_COLORS,
	RESOLVE_MARKER_COLORS,
} from "./marker-categories.ts";

export type PresetCategory = { name: string; color: string };
export type CategoryPreset = {
	id: string;
	name: string;
	description: string;
	categories: readonly PresetCategory[];
};

const named = (host: string, colors: Record<string, string>): PresetCategory[] =>
	Object.entries(colors).map(([name, color]) => ({ name: `${host} ${name}`, color }));

/** What a new project starts with. Colors that stay apart in the marker palettes of the NLEs. */
const POSTPIN_CATEGORIES: PresetCategory[] = [
	{ name: "Important", color: "#facc15" },
	{ name: "QC", color: "#ef4444" },
	{ name: "VFX", color: "#22c55e" },
	{ name: "Edit", color: "#3b82f6" },
	{ name: "Color", color: "#a855f7" },
	{ name: "Sound", color: "#06b6d4" },
	{ name: "Music", color: "#ec4899" },
	{ name: "Graphics", color: "#84cc16" },
	{ name: "Subtitles", color: "#e5e7eb" },
	{ name: "Client Feedback", color: "#f97316" },
];

export const CATEGORY_PRESETS = [
	{
		id: "postpin",
		name: "PostPin",
		description: "Common review categories like QC, VFX and Sound",
		categories: POSTPIN_CATEGORIES,
	},
	{
		id: "resolve",
		name: "DaVinci Resolve",
		description: "One category per Resolve marker color, as the Resolve plugin syncs them",
		categories: named("Resolve", RESOLVE_MARKER_COLORS),
	},
	{
		id: "premiere",
		name: "Premiere Pro",
		description: "One category per Premiere marker color, as the Premiere plugin syncs them",
		categories: PREMIERE_MARKER_COLORS.map((c) => ({
			name: `Premiere Pro ${c.name}`,
			color: c.hex,
		})),
	},
	{
		id: "avid",
		name: "Avid Media Composer",
		description: "One category per Avid locator color, as imported EDLs use them",
		categories: named("Avid", AVID_COLORS),
	},
	{
		id: "final-cut",
		name: "Final Cut Pro",
		description: "One category per Final Cut marker type, as imported FCPXMLs use them",
		categories: named("Final Cut", FINAL_CUT_TYPES),
	},
] as const satisfies readonly CategoryPreset[];

/** The categories every new project starts with */
export const DEFAULT_CATEGORIES: readonly PresetCategory[] = POSTPIN_CATEGORIES;

export type BuiltInPresetId = (typeof CATEGORY_PRESETS)[number]["id"];

export function categoryPreset(id: BuiltInPresetId): CategoryPreset {
	return CATEGORY_PRESETS.find((p) => p.id === id)!;
}
