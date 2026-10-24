import DeltaE from "delta-e";
import type { ColorPalette } from "./bridge";

// used for markers without a category and colors missing from the palette
export const DEFAULT_MARKER_HEX = "#3B82F6";

// sRGB hex -> CIE L*a*b* (D65)
export function hexToLab(hex: string) {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
	});
	const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
	const x = f((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
	const y = f(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
	const z = f((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
	return { L: 116 * y - 16, A: 500 * (x - y), B: 200 * (y - z) };
}

// Marker colors are palette ids, or hex colors when the host takes any color
export function colorToHex(color: string, palette: ColorPalette) {
	if (palette === "rgb") return color;
	return palette.find((c) => c.id === color)?.hex ?? DEFAULT_MARKER_HEX;
}

export function closestColor(hex: string, palette: ColorPalette) {
	if (palette === "rgb") return hex;
	const lab = hexToLab(hex);
	let best = palette[0]?.id ?? "";
	let bestDistance = Infinity;
	for (const color of palette) {
		const distance = DeltaE.getDeltaE00(lab, hexToLab(color.hex));
		if (distance < bestDistance) {
			best = color.id;
			bestDistance = distance;
		}
	}
	return best;
}
