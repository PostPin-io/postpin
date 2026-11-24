export type ThumbnailSize = "S" | "M" | "L";

export interface ThumbnailPreset {
	label: string;
	/** Width of the frame as grabbed: about twice what the PDF prints, so it stays sharp */
	grabPx: number;
	/**
	 * Rows on a PDF page after the first, which has the heading: the thumbnails get as large as that
	 * allows for the video's aspect ratio.
	 * A marker with a long description is taller, so a page can hold fewer.
	 */
	perPage: number;
	/** Wide thumbnails need a landscape page next to the text columns */
	landscape: boolean;
	/** Width in the spreadsheet */
	excelPx: number;
}

export const THUMBNAIL_PRESETS: Record<ThumbnailSize, ThumbnailPreset> = {
	S: { label: "Small", grabPx: 640, perPage: 7, landscape: false, excelPx: 160 },
	M: { label: "Medium", grabPx: 960, perPage: 3, landscape: true, excelPx: 280 },
	L: { label: "Large", grabPx: 1440, perPage: 2, landscape: true, excelPx: 440 },
};
