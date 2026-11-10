import type { PaletteColor } from "@postpin-io/plugin-core/bridge";

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
