/** mm around the page's content */
export const PAGE_MARGIN = 14;
/** mm around every cell's content */
export const CELL_PAD = 1.5;
/** mm of the table's header row, repeated on every page */
export const HEAD_ROW = 7;
/** mm of the page number line below the table */
export const FOOTER = 8;
/** The marker text keeps at least this much (mm) next to a wide thumbnail */
export const MIN_TEXT_WIDTH = 60;
/** Aspect ratio (height / width) when no frame could be grabbed */
export const FALLBACK_ASPECT = 9 / 16;

/**
 * Width (mm) of the thumbnails so that `perPage` rows fill a page without the heading. A wide picture
 * (scope, 2.39:1) stops at `maxWidth` and its rows get shorter; an upright one gets narrow.
 */
export function thumbnailWidth(options: {
	/** mm the table rows have on a page, without the header row */
	tableHeight: number;
	perPage: number;
	/** height / width of the picture */
	aspect: number;
	maxWidth: number;
}) {
	const { tableHeight, perPage, aspect, maxWidth } = options;
	// Half a millimetre spare per row, so rounding never pushes the last one to the next page
	const rowHeight = tableHeight / perPage - 0.5;
	const height = rowHeight - 2 * CELL_PAD;
	return Math.max(0, Math.min(height / aspect, maxWidth));
}
