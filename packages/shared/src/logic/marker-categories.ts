// The categories markers from editing software land in: named after where they came from and
// their color (or, in Final Cut, their type), like the plugins name them when they sync markers,
// e.g. "Resolve Blue". See cut-list.ts and plugin-core/src/sync.ts.

/** Resolve's marker colors, as the Resolve plugin shows them */
export const RESOLVE_MARKER_COLORS = {
	Blue: "#008feb",
	Cyan: "#00dad7",
	Green: "#00ba00",
	Yellow: "#ffa000",
	Red: "#fc0000",
	Pink: "#ff27d2",
	Purple: "#a800ff",
	Fuchsia: "#db067b",
	Rose: "#ffa4c1",
	Lavender: "#ad9dd1",
	Sky: "#80eaff",
	Mint: "#50e300",
	Lemon: "#dfec53",
	Sand: "#d59863",
	Cocoa: "#80594a",
	Cream: "#f9ede4",
} as const;

/** The locator colors of Avid's EDLs (`* LOC:` lines) */
const AVID_COLORS: Record<string, string> = {
	Red: "#ff0000",
	Green: "#00c000",
	Blue: "#0060ff",
	Cyan: "#00d0d0",
	Magenta: "#e000e0",
	Yellow: "#ffd000",
	Black: "#202020",
	White: "#f0f0f0",
};

/** Final Cut has no marker colors, only types, which it colors itself */
const FINAL_CUT_TYPES: Record<string, string> = {
	Marker: "#3b82f6",
	"To-do": "#ef4444",
	Done: "#22c55e",
	Chapter: "#f97316",
};

export type MarkerHost = "Resolve" | "Avid" | "Final Cut";
const FALLBACK = "#3b82f6";

/** "red", "RED" → "Red" */
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** The category of a marker from `host` with this color or type */
export function markerCategory(host: MarkerHost, label: string): { name: string; color: string } {
	const table: Record<string, string> =
		host === "Resolve" ? RESOLVE_MARKER_COLORS : host === "Avid" ? AVID_COLORS : FINAL_CUT_TYPES;
	const key = host === "Final Cut" ? label : titleCase(label);
	return { name: `${host} ${key}`, color: table[key] ?? FALLBACK };
}
