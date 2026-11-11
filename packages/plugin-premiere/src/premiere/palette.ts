import type { PaletteColor } from "@postpin-io/plugin-core/bridge";
import type { ClipColor } from "@postpin-io/shared/types/TimelineSnapshot";

// Premiere's factory label colors in the order of ProjectItemColorLabel, which is also the
// <index> of BE.Prefs.LabelNames.<index> in the preferences. The name is what Final Cut Pro XML
// has in <label2>. Users can rename labels and change their colors, see labels.ts.
// Values from the preferences with the built-in "Standard" label preset.
export const CLIP_PALETTE: readonly ClipColor[] = [
	{ name: "Violet", hex: "#3e0aae" },
	{ name: "Iris", hex: "#004b67" },
	{ name: "Caribbean", hex: "#2a5507" },
	{ name: "Lavender", hex: "#751187" },
	{ name: "Cerulean", hex: "#05555b" },
	{ name: "Forest", hex: "#3d4a00" },
	{ name: "Rose", hex: "#8c0235" },
	{ name: "Mango", hex: "#893a04" },
	{ name: "Purple", hex: "#6100b7" },
	{ name: "Blue", hex: "#122d9a" },
	{ name: "Teal", hex: "#014e45" },
	{ name: "Magenta", hex: "#840d58" },
	{ name: "Tan", hex: "#6f5a45" },
	{ name: "Green", hex: "#0d5d27" },
	{ name: "Brown", hex: "#5d3b06" },
	{ name: "Yellow", hex: "#6f6619" },
];

// Premiere's eight marker colors, the palette id is the color index.
// TODO: hex values are approximations, compare with Marker.getColor()
export const PALETTE: PaletteColor[] = [
	{ id: "0", hex: "#4caf50", name: "Green" },
	{ id: "1", hex: "#e0474c", name: "Red" },
	{ id: "2", hex: "#c44fd1", name: "Purple" },
	{ id: "3", hex: "#f0882b", name: "Orange" },
	{ id: "4", hex: "#e8d33a", name: "Yellow" },
	{ id: "5", hex: "#e6e6e6", name: "White" },
	{ id: "6", hex: "#3d7ef2", name: "Blue" },
	{ id: "7", hex: "#31c4d4", name: "Cyan" },
];
