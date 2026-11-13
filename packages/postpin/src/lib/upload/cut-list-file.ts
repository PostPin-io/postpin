// Reading a cut list file in the browser: an EDL or FCPXML (also a .fcpxmld bundle, which is a
// folder) becomes the small cut list that is sent (see @postpin-io/shared/logic/cut-list). Used by
// the upload form and by the review page, which can import one later.
import {
	CUT_LIST_MAX_BYTES,
	CutListError,
	cutListMarkers,
	cutListSize,
	cutListSummary,
	cutListTracks,
	type CutList,
} from "@postpin-io/shared/logic/cut-list";
import { parseEdl, unsupportedCutList } from "@postpin-io/shared/logic/edl";
import { fcpxmlToCutList, isFcpxml } from "@postpin-io/shared/logic/fcpxml";
import { formatByteSize } from "@postpin-io/shared/logic/bytes";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

/**
 * The file holds a whole project (FCPXML) or every track (EDL), so it may be far larger than what
 * is sent, see CUT_LIST_MAX_BYTES
 */
export const CUT_LIST_FILE_MAX_BYTES = 5 * 1000 ** 3;
export const CUT_LIST_ACCEPT = ".edl,.fcpxml,.xml,text/plain";
export const CUT_LIST_FORMATS = { edl: "EDL", fcpxml: "FCPXML" } as const;

export type CutListRead =
	{ ok: true; name: string; list: CutList } | { ok: false; name: string | null; error: string };

const isBundle = (name: string) => name.toLowerCase().endsWith(".fcpxmld");

/** The cut list in a chosen file, or why there is none */
export async function readCutListFile(file: File): Promise<CutListRead> {
	const fail = (error: string): CutListRead => ({ ok: false, name: file.name, error });
	if (file.size > CUT_LIST_FILE_MAX_BYTES) {
		return fail(`The file is too large, at most ${formatByteSize(CUT_LIST_FILE_MAX_BYTES)}`);
	}
	let text: string;
	try {
		// AAF and other binary formats: say what to export instead of "Not an EDL"
		const unsupported = unsupportedCutList(
			new Uint8Array(await file.slice(0, 512).arrayBuffer()),
			file.name,
		);
		if (unsupported) return fail(unsupported);
		text = await file.text();
	} catch {
		return fail(
			isBundle(file.name)
				? "A .fcpxmld file is a folder: drag it onto this field instead, or choose the Info.fcpxml inside it"
				: "The file could not be read",
		);
	}
	try {
		const list = isFcpxml(text) ? fcpxmlToCutList(text) : parseEdl(text);
		if (cutListSize(list) > CUT_LIST_MAX_BYTES) return fail("The timeline has too many clips");
		return { ok: true, name: file.name, list };
	} catch (e) {
		return fail(e instanceof CutListError ? e.message : "The timeline data could not be read");
	}
}

/**
 * The cut list in what was dropped: a file, or a .fcpxmld bundle, which arrives as a folder whose
 * timeline is the Info.fcpxml inside. Null when nothing was dropped.
 */
export async function readDroppedCutList(data: DataTransfer | null): Promise<CutListRead | null> {
	const entry = data?.items[0]?.webkitGetAsEntry?.();
	if (entry?.isDirectory) {
		const info = await new Promise<File | null>((resolve) =>
			(entry as FileSystemDirectoryEntry).getFile(
				"Info.fcpxml",
				{},
				(f) => (f as FileSystemFileEntry).file(resolve, () => resolve(null)),
				() => resolve(null),
			),
		);
		if (!info) return { ok: false, name: entry.name, error: "This folder has no Info.fcpxml" };
		return { ...(await readCutListFile(info)), name: entry.name };
	}
	const file = data?.files[0];
	return file ? await readCutListFile(file) : null;
}

/** Whether the list fits the video's frame rate, and what is in it */
export function checkCutListAt(list: CutList, rate: FrameRate) {
	try {
		cutListTracks(list, rate, "check");
		cutListMarkers(list, rate);
		return { ok: true as const, ...cutListSummary(list) };
	} catch (e) {
		return {
			ok: false as const,
			error: e instanceof CutListError ? e.message : "The timeline data could not be read",
		};
	}
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "27 video clips on 2 tracks, 4 audio tracks, 3 markers" */
export const cutListSummaryText = (s: ReturnType<typeof cutListSummary>) =>
	[
		s.videoClips > 0 &&
			`${plural(s.videoClips, "video clip")} on ${plural(s.videoTracks, "track")}`,
		s.audioTracks > 0 && plural(s.audioTracks, "audio track"),
		s.markers > 0 && plural(s.markers, "marker"),
	]
		.filter(Boolean)
		.join(", ") || "Nothing";

/**
 * Where an export's imported markers came from, for the review: "Markers from the EDL" and
 * "3 markers"; null without any
 */
export function importedMarkersText(counts: Record<keyof typeof CUT_LIST_FORMATS, number> | null) {
	if (!counts) return null;
	const total = counts.edl + counts.fcpxml;
	if (total === 0) return null;
	const from =
		counts.edl > 0 && counts.fcpxml > 0
			? "EDL and FCPXML"
			: `the ${CUT_LIST_FORMATS[counts.edl > 0 ? "edl" : "fcpxml"]}`;
	return { title: `Marker Import`, count: plural(total, "marker") };
}

/**
 * Drag & drop on a window's icon: highlights it while a file is over it, and on drop starts
 * reading at once (the browser empties the dropped data right after the event) and hands the read
 * to `ondropped`, which opens the window and imports it.
 */
export function iconDrop(a: {
	enabled: () => boolean;
	ondragging: (dragging: boolean) => void;
	ondropped: (read: Promise<CutListRead | null>) => void | Promise<void>;
}) {
	return {
		ondragenter: (e: DragEvent) => {
			if (!a.enabled()) return;
			e.preventDefault();
			a.ondragging(true);
		},
		ondragover: (e: DragEvent) => {
			if (a.enabled()) e.preventDefault();
		},
		ondragleave: () => a.ondragging(false),
		ondrop: (e: DragEvent) => {
			if (!a.enabled()) return;
			e.preventDefault();
			a.ondragging(false);
			void a.ondropped(readDroppedCutList(e.dataTransfer));
		},
	};
}
