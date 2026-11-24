import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
import type { ReviewMarker } from "../types.ts";

/** One marker as a line of the PDF table or the spreadsheet: text only, ready to print */
export interface ExportRow {
	tcIn: string;
	/** Empty for point markers */
	tcOut: string;
	/** Empty for point markers */
	duration: string;
	category: string;
	categoryColor: string | null;
	title: string;
	description: string;
	author: string;
}

export type ExportableMarker = Pick<
	ReviewMarker,
	"frame" | "duration" | "name" | "description" | "category" | "author" | "guest"
>;

export function toExportRow(marker: ExportableMarker, frameRate: FrameRate): ExportRow {
	const isRange = marker.duration > 0;
	return {
		tcIn: formatTimecode(marker.frame, frameRate),
		// Out is exclusive, like in the NLEs
		tcOut: isRange ? formatTimecode(marker.frame + marker.duration, frameRate) : "",
		duration: isRange ? formatTimecode(marker.duration, frameRate) : "",
		category: marker.category?.name ?? "",
		categoryColor: marker.category?.color ?? null,
		title: marker.name ?? "",
		description: marker.description ?? "",
		author: marker.author?.name ?? marker.guest?.name ?? "Deleted User",
	};
}
