// Premiere's label settings: names, colors and the default label per media type. They are in the
// preferences file only, the UXP API has neither the settings nor a track item's label.
import type { ClipColor } from "@postpin-io/shared/types/TimelineSnapshot";
import { CLIP_PALETTE } from "./palette";

/** Media types with a default label, named like the BE.Prefs.LabelDefaults.* preferences */
export type LabelMediaType = "Video" | "Audio" | "AV" | "Still" | "Sequence";

export interface LabelPrefs {
	/** by label index, as BE.Prefs.LabelNames.<index> and BE.Prefs.LabelColors.<index> */
	labels: ClipColor[];
	/** label index per media type */
	defaults: Record<LabelMediaType, number>;
}

// Premiere's factory settings, for when the preferences can't be read
export const DEFAULT_LABEL_PREFS: LabelPrefs = {
	labels: [...CLIP_PALETTE],
	defaults: { Video: 0, Audio: 2, AV: 1, Still: 3, Sequence: 5 },
};

const PREF = /<BE\.Prefs\.(LabelNames|LabelColors|LabelDefaults)\.(\w+)>([^<]*)</g;

// Colors are 0xBBGGRR integers
function bgrToHex(value: number) {
	const [r, g, b] = [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Reads the "Adobe Premiere Pro Prefs" file, settings missing from it keep the factory values */
export function parseLabelPrefs(prefsXml: string): LabelPrefs {
	const labels = DEFAULT_LABEL_PREFS.labels.map((label) => ({ ...label }));
	const defaults = { ...DEFAULT_LABEL_PREFS.defaults };
	for (const [, kind, key, raw] of prefsXml.matchAll(PREF)) {
		const value = raw!.trim();
		if (kind === "LabelDefaults") {
			if (key! in defaults) defaults[key as LabelMediaType] = Number(value);
			continue;
		}
		const label = labels[Number(key)];
		if (!label || value === "") continue;
		if (kind === "LabelNames") label.name = value;
		else label.hex = bgrToHex(Number(value));
	}
	return { labels, defaults };
}

/**
 * The color of a clip from the Final Cut Pro XML: its own label, or without one the default label
 * of its media type. Premiere leaves <labels> out when a clip has the default label.
 */
export function labelColor(
	prefs: LabelPrefs,
	clip: { label: string | null; mediaType: LabelMediaType | null },
): ClipColor | null {
	if (clip.label) return prefs.labels.find((label) => label.name === clip.label) ?? null;
	if (!clip.mediaType) return null;
	return prefs.labels[prefs.defaults[clip.mediaType]] ?? null;
}
