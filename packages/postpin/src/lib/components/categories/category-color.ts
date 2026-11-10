/** Black or white, depending on the perceived brightness of the category color */
export function contrastColor(hex: string): string | undefined {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return undefined;
	const n = parseInt(m[1], 16);
	const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
	return luminance > 150 ? "#000000" : "#ffffff";
}
