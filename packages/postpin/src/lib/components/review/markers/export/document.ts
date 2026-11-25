import type { Thumbnail } from "./frame-grabber.ts";
import type { ThumbnailSize } from "./presets.ts";
import type { ExportRow } from "./rows.ts";

/** Everything a marker export prints, whatever the format */
export interface ExportDocument {
	/** The export's name */
	title: string;
	/** Organization, project and timeline; empty for guests, who don't see the team's names */
	location: string[];
	/** Marker count and date */
	details: string;
	rows: ExportRow[];
	/** By row; null where the frame could not be grabbed. Without thumbnails: null */
	thumbnails: (Thumbnail | null)[] | null;
	size: ThumbnailSize;
}

export type ExportFormat = "pdf" | "xlsx" | "csv";

export const FORMATS: Record<
	ExportFormat,
	{ label: string; extension: string; /** Can hold the thumbnails */ pictures: boolean }
> = {
	pdf: { label: "PDF", extension: "pdf", pictures: true },
	xlsx: { label: "Excel", extension: "xlsx", pictures: true },
	csv: { label: "CSV", extension: "csv", pictures: false },
};
