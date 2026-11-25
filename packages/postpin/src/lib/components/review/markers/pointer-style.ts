import { contrastColor } from "../../categories/category-color.ts";

/** An outline in the opposite brightness keeps dark and light colors readable on any footage */
export const haloOf = (color: string) =>
	contrastColor(color) === "#ffffff" ? "rgb(255 255 255 / 0.7)" : "rgb(0 0 0 / 0.55)";
