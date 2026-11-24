import { describe, expect, it } from "vitest";
import { CELL_PAD, thumbnailWidth } from "#lib/components/review/markers/export/pdf-layout.ts";

describe("thumbnailWidth", () => {
	const page = { tableHeight: 150, perPage: 3, maxWidth: 200 };
	const rowHeight = (width: number, aspect: number) => width * aspect + 2 * CELL_PAD;

	it.each([
		["16:9", 9 / 16],
		["4:3", 3 / 4],
		["1:1", 1],
		["9:16", 16 / 9],
	])("%s: the rows fill the page, with a little to spare", (_, aspect) => {
		const height = rowHeight(thumbnailWidth({ ...page, aspect }), aspect);
		expect(height * 3).toBeLessThanOrEqual(150);
		expect(height * 3).toBeGreaterThan(147);
	});

	it("a wide picture stops at the width the text leaves", () => {
		expect(thumbnailWidth({ ...page, aspect: 1 / 2.39, maxWidth: 90 })).toBe(90);
	});

	it("never negative", () => {
		expect(thumbnailWidth({ ...page, tableHeight: 5, aspect: 9 / 16 })).toBe(0);
	});
});
