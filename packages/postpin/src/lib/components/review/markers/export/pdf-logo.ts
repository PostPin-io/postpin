import type { jsPDF } from "jspdf";

// The PostPin logo as vector paths, from Logo.svelte: bars of a timeline, a pin above the middle one
const VIEW_HEIGHT = 1669;
const STROKE = 150;
const BARS: [x: number, top: number, color: string][] = [
	[75, 1082, "#3d7fff"],
	[363, 862, "#21b8cf"],
	[650, 1221, "#31b86a"],
	[938, 501, "#1f2328"], // currentColor in the app: dark on paper
	[1226, 946, "#f5b92f"],
	[1513, 1139, "#e8559a"],
	[1801, 1003, "#8a63d2"],
];
const BOTTOM = 1594;
const PIN = { x: 938, y: 250, r: 175, color: "#e8461d" };
/** Width of the logo for a height of 1 */
export const LOGO_ASPECT = 1876 / VIEW_HEIGHT;

/** Draws the logo with its top left corner at x, y (mm), `height` mm tall */
export function drawLogo(doc: jsPDF, x: number, y: number, height: number) {
	const scale = height / VIEW_HEIGHT;
	const at = (vx: number, vy: number) => [x + vx * scale, y + vy * scale] as const;
	doc.saveGraphicsState();
	doc.setLineCap("round");
	doc.setLineWidth(STROKE * scale);
	for (const [bx, top, color] of BARS) {
		doc.setDrawColor(color);
		doc.line(...at(bx, top), ...at(bx, BOTTOM));
	}
	doc.setDrawColor(PIN.color);
	doc.circle(...at(PIN.x, PIN.y), PIN.r * scale, "S");
	doc.restoreGraphicsState();
}

/**
 * The logo and the word "PostPin", right-aligned to `right` (mm), its top at `top`.
 * Returns where it starts on the left.
 */
export function drawBrand(doc: jsPDF, right: number, top: number, height: number) {
	doc
		.setFont("helvetica", "bold")
		.setFontSize(height * 2.2)
		.setTextColor(31, 35, 40);
	const word = "PostPin";
	const wordWidth = doc.getTextWidth(word);
	const logoWidth = height * LOGO_ASPECT;
	const gap = height * 0.35;
	const left = right - wordWidth - gap - logoWidth;
	drawLogo(doc, left, top, height);
	doc.text(word, left + logoWidth + gap, top + height, { baseline: "bottom" });
	doc.setTextColor(0);
	return left;
}
