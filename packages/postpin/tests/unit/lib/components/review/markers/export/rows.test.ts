import { describe, expect, it } from "vitest";
import { toExportRow, type ExportableMarker } from "#lib/components/review/markers/export/rows.ts";
import { safeFileName } from "#lib/components/review/markers/export/download.ts";

const fps25 = { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };

const marker = (fields: Partial<ExportableMarker> = {}) =>
	({
		frame: 90_000,
		duration: 0,
		name: "Color shift",
		description: "Too warm",
		category: { name: "Grading", color: "#ff8800" },
		author: { id: "u1", name: "Alex", image: null },
		guest: null,
		...fields,
	}) as ExportableMarker;

describe("toExportRow", () => {
	it("a point marker has no out point or duration", () => {
		expect(toExportRow(marker(), fps25)).toEqual({
			tcIn: "01:00:00:00",
			tcOut: "",
			duration: "",
			category: "Grading",
			categoryColor: "#ff8800",
			title: "Color shift",
			description: "Too warm",
			author: "Alex",
		});
	});

	it("a range ends after its last frame, like in the NLEs", () => {
		const row = toExportRow(marker({ duration: 50 }), fps25);
		expect(row.tcOut).toBe("01:00:02:00");
		expect(row.duration).toBe("00:00:02:00");
	});

	it("a guest's marker carries the guest's name", () => {
		const row = toExportRow(marker({ author: null, guest: { name: "Client" } }), fps25);
		expect(row.author).toBe("Client");
	});

	it("a marker whose author is gone", () => {
		const row = toExportRow(marker({ author: null, guest: null, description: null }), fps25);
		expect(row.author).toBe("Deleted User");
		expect(row.description).toBe("");
	});
});

describe("safeFileName", () => {
	it("drops what file systems refuse", () => {
		expect(safeFileName('Cut 3: "final"/v2')).toBe("Cut 3 final v2");
	});

	it("never returns an empty name", () => {
		expect(safeFileName("  ?? ")).toBe("export");
	});
});
