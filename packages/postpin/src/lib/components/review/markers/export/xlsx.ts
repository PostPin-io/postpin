import { contrastColor } from "../../../categories/category-color.ts";
import type { ExportDocument } from "./document.ts";
import { THUMBNAIL_PRESETS } from "./presets.ts";

/** Excel's column width is in characters of the default font, about 7 px each */
const PX_PER_CHAR = 7;
/** Row heights are in points */
const PT_PER_PX = 0.75;

export async function buildXlsx(input: ExportDocument): Promise<Blob> {
	const { default: ExcelJS } = await import("exceljs");
	const preset = THUMBNAIL_PRESETS[input.size];
	const thumbnails = input.thumbnails;

	const workbook = new ExcelJS.Workbook();
	workbook.created = new Date();
	const columns = [
		...(thumbnails
			? [{ header: "", key: "thumbnail", width: preset.excelPx / PX_PER_CHAR + 1 }]
			: []),
		{ header: "TC In", key: "tcIn", width: 13 },
		{ header: "TC Out", key: "tcOut", width: 13 },
		{ header: "Duration", key: "duration", width: 13 },
		{ header: "Category", key: "category", width: 18 },
		{ header: "Title", key: "title", width: 32 },
		{ header: "Description", key: "description", width: 60 },
		{ header: "Author", key: "author", width: 20 },
	];
	// What the table is about above it: export, where it lies, count and date
	const info = [input.title, input.location.join(" › "), input.details].filter(Boolean);
	const headerRow = info.length + 2;
	const sheet = workbook.addWorksheet("Markers", {
		views: [{ state: "frozen", ySplit: headerRow }],
	});
	// Keys and widths only: the header goes below the info lines
	sheet.columns = columns.map(({ key, width }) => ({ key, width }));
	info.forEach((line, index) => {
		const row = sheet.addRow([line]);
		row.font = index === 0 ? { bold: true, size: 14 } : { color: { argb: "FF555555" } };
	});
	sheet.addRow([]);
	const header = sheet.addRow(columns.map((column) => column.header));
	header.font = { bold: true };
	header.alignment = { vertical: "middle" };

	input.rows.forEach((data, index) => {
		const { categoryColor, ...values } = data;
		const row = sheet.addRow(values);
		row.alignment = { vertical: "top", wrapText: true };

		const color = categoryColor && /^#[0-9a-f]{6}$/i.exec(categoryColor)?.[0];
		if (color) {
			const cell = row.getCell("category");
			cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color.slice(1)}` } };
			cell.font = { color: { argb: contrastColor(color) === "#ffffff" ? "FFFFFFFF" : "FF000000" } };
		}

		const thumb = thumbnails?.[index];
		if (!thumb) return;
		const height = (preset.excelPx * thumb.height) / thumb.width;
		row.height = height * PT_PER_PX + 4;
		const image = workbook.addImage({ base64: thumb.dataUrl, extension: "jpeg" });
		sheet.addImage(image, {
			// Zero-based, row.number is one-based
			tl: { col: 0, row: row.number - 1 },
			ext: { width: preset.excelPx, height },
			editAs: "oneCell",
		});
	});

	const buffer = await workbook.xlsx.writeBuffer();
	return new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
}
