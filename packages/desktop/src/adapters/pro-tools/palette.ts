import type { PaletteColor } from "@postpin-io/plugin-core/bridge";
import { ColorPaletteTarget } from "../../third-party/protools-sdk/dist/PTSL";
import { send } from "./ptsl";

// Memory location color_index counts from 1; for 0 Pro Tools picks a color itself
const COLOR_INDEX_BASE = 1;

// Palette colors are "#AARRGGBB" with an opaque alpha, e.g. "#ff000000" for black
export function toHex(ptslColor: string): string {
	return `#${ptslColor.slice(3, 9)}`;
}

// Palette ids are the color_index values memory locations use
export const colorIndexOf = (paletteId: string) => Number(paletteId);

export async function getMarkerPalette(): Promise<PaletteColor[]> {
	const { colorList } = await send("GetColorPalette", {
		colorPaletteTarget: ColorPaletteTarget.CPTarget_Markers,
	});
	return colorList.map((color, index) => {
		const id = String(index + COLOR_INDEX_BASE);
		return { id, hex: toHex(color), name: `Color ${id}` };
	});
}
