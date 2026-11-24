import type { jsPDF } from "jspdf";
import type { ExportDocument } from "./document.ts";
import { drawBrand } from "./pdf-logo.ts";
import {
	CELL_PAD as PAD,
	FALLBACK_ASPECT,
	FOOTER,
	HEAD_ROW,
	MIN_TEXT_WIDTH,
	PAGE_MARGIN,
	thumbnailWidth,
} from "./pdf-layout.ts";
import { THUMBNAIL_PRESETS } from "./presets.ts";

const FONT_SIZE = 8;
/** A category column wider than this would squeeze the text: longer names end in "…" */
const MAX_CATEGORY_MM = 50;
const TIMECODE_WIDTH = 26;
const AUTHOR_WIDTH = 22;

export async function buildPdf(input: ExportDocument): Promise<Blob> {
	const [{ jsPDF }, { autoTable }] = await Promise.all([
		import("jspdf"),
		import("jspdf-autotable"),
	]);
	const preset = THUMBNAIL_PRESETS[input.size];
	const thumbnails = input.thumbnails;
	const doc = new jsPDF({
		orientation: thumbnails && preset.landscape ? "landscape" : "portrait",
		unit: "mm",
		format: "a4",
	});
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const contentWidth = pageWidth - 2 * PAGE_MARGIN;

	// The heading is on the first page only
	const tableTop = drawHeading(doc, input) + 5;
	const tableBottom = PAGE_MARGIN + FOOTER;

	// The category stays on one line: the column is as wide as its longest name
	doc.setFontSize(FONT_SIZE);
	const categoryText = Math.max(
		doc.setFont("helvetica", "bold").getTextWidth("Category"),
		...input.rows.map((row) => doc.setFont("helvetica", "normal").getTextWidth(row.category)),
	);
	const categoryWidth = Math.min(categoryText + 2 * PAD + 0.5, MAX_CATEGORY_MM);

	// All frames come from the same video: one size for all
	const firstThumb = thumbnails?.find((thumb) => thumb !== null);
	const thumbWidth = thumbnailWidth({
		// Sized for the pages after the first, which have no heading: they hold perPage rows,
		// the first page fewer
		tableHeight: pageHeight - PAGE_MARGIN - tableBottom - HEAD_ROW,
		perPage: preset.perPage,
		aspect: firstThumb ? firstThumb.height / firstThumb.width : FALLBACK_ASPECT,
		maxWidth:
			contentWidth - 2 * PAD - TIMECODE_WIDTH - categoryWidth - AUTHOR_WIDTH - MIN_TEXT_WIDTH,
	});

	const thumbColumn = thumbnails ? [""] : [];
	autoTable(doc, {
		startY: tableTop,
		margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: tableBottom },
		head: [[...thumbColumn, "Timecode", "Category", "Marker", "Author"]],
		body: input.rows.map((row) => [
			...thumbColumn,
			// One column for in, out and duration leaves the room for the text
			row.tcOut ? `In  ${row.tcIn}\nOut ${row.tcOut}\nDur ${row.duration}` : `In  ${row.tcIn}`,
			row.category,
			[row.title, row.description].filter(Boolean).join("\n\n"),
			row.author,
		]),
		styles: { fontSize: FONT_SIZE, cellPadding: PAD, valign: "top", overflow: "linebreak" },
		headStyles: { fillColor: [40, 40, 40], minCellHeight: HEAD_ROW },
		rowPageBreak: "avoid",
		columnStyles: {
			...(thumbnails ? { 0: { cellWidth: thumbWidth + 2 * PAD } } : {}),
			[thumbColumn.length + 0]: { cellWidth: TIMECODE_WIDTH, font: "courier", fontSize: 7 },
			[thumbColumn.length + 1]: { cellWidth: categoryWidth, overflow: "ellipsize" },
			[thumbColumn.length + 3]: { cellWidth: AUTHOR_WIDTH },
		},
		didParseCell: ({ section, column, row, cell }) => {
			if (!thumbnails || section !== "body" || column.index !== 0) return;
			const thumb = thumbnails[row.index];
			if (thumb) cell.styles.minCellHeight = thumbHeight(thumbWidth, thumb) + 2 * PAD;
		},
		didDrawCell: ({ section, column, row, cell }) => {
			if (section !== "body") return;
			if (thumbnails && column.index === 0) {
				// A frame that could not be grabbed leaves the cell empty, not the export broken
				const thumb = thumbnails[row.index];
				if (!thumb) return;
				const height = thumbHeight(thumbWidth, thumb);
				doc.addImage(thumb.dataUrl, "JPEG", cell.x + PAD, cell.y + PAD, thumbWidth, height);
			}
			if (column.index === thumbColumn.length + 1) {
				// The category's color as a bar on the left of its cell
				const color = input.rows[row.index]?.categoryColor;
				if (!color) return;
				doc.setFillColor(color);
				doc.rect(cell.x, cell.y, 0.8, cell.height, "F");
			}
		},
	});

	// Page numbers only once all pages exist
	const pages = doc.getNumberOfPages();
	doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
	for (let page = 1; page <= pages; page++) {
		doc.setPage(page);
		doc.text(`Page ${page} of ${pages}`, pageWidth - PAGE_MARGIN, pageHeight - PAGE_MARGIN, {
			align: "right",
		});
	}
	doc.setTextColor(0);

	return doc.output("blob");
}

/** Logo, export name, where it lies and the details; returns where the heading ends (mm) */
function drawHeading(doc: jsPDF, input: ExportDocument) {
	const pageWidth = doc.internal.pageSize.getWidth();
	const brandLeft = drawBrand(doc, pageWidth - PAGE_MARGIN, 11, 7);
	// A long export name stops short of the logo
	const headingWidth = brandLeft - 8 - PAGE_MARGIN;
	let y = 16;
	doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(0);
	doc.text(fitText(doc, input.title, headingWidth), PAGE_MARGIN, y);
	if (input.location.length > 0) {
		y += 6;
		doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(60);
		doc.text(fitText(doc, input.location.join("  ›  "), headingWidth), PAGE_MARGIN, y);
	}
	y += 5;
	doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
	doc.text(fitText(doc, input.details, headingWidth), PAGE_MARGIN, y);
	doc.setTextColor(0);
	return y;
}

const thumbHeight = (width: number, thumb: { width: number; height: number }) =>
	(width * thumb.height) / thumb.width;

/** The text in the current font, shortened with "…" to fit the width (mm) */
function fitText(doc: { getTextWidth(text: string): number }, text: string, width: number) {
	if (doc.getTextWidth(text) <= width) return text;
	let end = text.length;
	while (end > 0 && doc.getTextWidth(`${text.slice(0, end).trimEnd()}…`) > width) end--;
	return `${text.slice(0, end).trimEnd()}…`;
}
