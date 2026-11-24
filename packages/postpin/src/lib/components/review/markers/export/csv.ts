import type { ExportDocument } from "./document.ts";
import type { ExportRow } from "./rows.ts";

const COLUMNS: [header: string, key: keyof ExportRow][] = [
	["TC In", "tcIn"],
	["TC Out", "tcOut"],
	["Duration", "duration"],
	["Category", "category"],
	["Title", "title"],
	["Description", "description"],
	["Author", "author"],
];

/** Byte order mark, so Excel reads the file as UTF-8 */
const BOM = String.fromCharCode(0xfeff);

/** RFC 4180, with a BOM so Excel reads it as UTF-8 */
export function buildCsv(input: Pick<ExportDocument, "rows">): Blob {
	const lines = [
		COLUMNS.map(([header]) => header),
		...input.rows.map((row) => COLUMNS.map(([, key]) => String(row[key] ?? ""))),
	].map((cells) => cells.map(csvCell).join(","));
	return new Blob([`${BOM}${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
}

export function csvCell(value: string) {
	// A spreadsheet would run a cell that starts like a formula: titles are typed by reviewers
	const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}
