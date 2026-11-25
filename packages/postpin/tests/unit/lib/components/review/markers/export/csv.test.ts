import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "#lib/components/review/markers/export/csv.ts";

const row = {
	tcIn: "01:00:00:00",
	tcOut: "01:00:02:00",
	duration: "00:00:02:00",
	category: "Grading",
	categoryColor: "#ff8800",
	title: 'Too "warm", here',
	description: "Line one\nLine two",
	author: "Alex",
};

describe("buildCsv", () => {
	it("a header and one line per marker, readable by Excel as UTF-8", async () => {
		const bytes = new Uint8Array(await buildCsv({ rows: [row] }).arrayBuffer());
		// The BOM: TextDecoder drops it, so look at the bytes
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		expect(new TextDecoder().decode(bytes)).toBe(
			"TC In,TC Out,Duration,Category,Title,Description,Author\r\n" +
				'01:00:00:00,01:00:02:00,00:00:02:00,Grading,"Too ""warm"", here","Line one\nLine two",Alex\r\n',
		);
	});
});

describe("csvCell", () => {
	it("leaves plain text alone", () => {
		expect(csvCell("Überblendung")).toBe("Überblendung");
	});

	it("keeps spreadsheets from running a formula", () => {
		expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(csvCell("-1")).toBe("'-1");
	});

	it("quotes leading and trailing spaces, which spreadsheets would drop", () => {
		expect(csvCell(" x")).toBe('" x"');
	});
});
