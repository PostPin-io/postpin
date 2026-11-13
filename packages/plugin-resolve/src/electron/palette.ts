import { RESOLVE_MARKER_COLORS } from "@postpin-io/shared/logic/marker-categories";
import type { ClipColor, MarkerColor } from "./resolve";

// the same colors name the categories of markers from a Resolve EDL (see shared's cut lists)
export const MARKER_PALETTE: Record<MarkerColor, string> = RESOLVE_MARKER_COLORS;

export const CLIP_PALETTE: Record<ClipColor, string> = {
	Orange: "#ff6c00",
	Apricot: "#ffaa17",
	Yellow: "#e2b300",
	Lime: "#a0ce00",
	Olive: "#56a600",
	Green: "#209d6e",
	Teal: "#00a7a4",
	Navy: "#006086",
	Blue: "#3384ad",
	Purple: "#ab7bac",
	Violet: "#e85299",
	Pink: "#fc8fbe",
	Tan: "#c3b7a0",
	Beige: "#d3a784",
	Brown: "#ae6d00",
	Chocolate: "#a16044",
};
