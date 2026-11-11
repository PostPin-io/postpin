import { XMLParser } from "fast-xml-parser";
import type { LabelMediaType } from "./labels";

export interface XmlClip {
	/** <name>, to check that the numbering matches the snapshot's */
	name: string;
	/** <labels><label2>, null when the clip has the default label of its media type */
	label: string | null;
	/** picks the default label, null when the XML doesn't tell */
	mediaType: LabelMediaType | null;
}

// Only the parts that are read
interface XmlFile {
	"@_id"?: string;
	duration?: string;
	media?: { video?: unknown; audio?: unknown };
}
interface XmlClipItem {
	name?: string;
	labels?: { label2?: string };
	file?: XmlFile;
	/** set for nested sequences instead of file */
	sequence?: unknown;
}
interface XmlTrack {
	clipitem?: XmlClipItem[];
	"@_currentExplodedTrackIndex"?: string;
}
interface XmlTrackList {
	track?: XmlTrack[];
}

const parser = new XMLParser({
	ignoreAttributes: false,
	parseTagValue: false,
	isArray: (tagName) => tagName === "track" || tagName === "clipitem",
});

const tracksOf = (list: XmlTrackList | "" | undefined) =>
	(typeof list === "object" ? list.track : undefined) ?? [];

const isFirstPart = (track: XmlTrack) => (track["@_currentExplodedTrackIndex"] ?? "0") === "0";

// A file is described once, at its first clip (which can be on any track); later clips only
// reference it as <file id="file-2"/>
function fileDefinitions(clips: XmlClipItem[]) {
	const files = new Map<string, XmlFile>();
	for (const { file } of clips) {
		const id = file?.["@_id"];
		if (id && file.media && !files.has(id)) files.set(id, file);
	}
	return files;
}

function mediaTypeOf(clip: XmlClipItem, files: Map<string, XmlFile>): LabelMediaType | null {
	if (clip.sequence !== undefined) return "Sequence";
	const file = clip.file?.["@_id"] ? files.get(clip.file["@_id"]) : undefined;
	const hasVideo = file?.media?.video !== undefined;
	const hasAudio = file?.media?.audio !== undefined;
	if (hasVideo && hasAudio) return "AV";
	if (hasAudio) return "Audio";
	// graphics and still images have no duration of their own
	if (hasVideo) return file?.duration === undefined ? "Still" : "Video";
	return null;
}

export function clipLabels(xml: string): Map<string, XmlClip> {
	const media = parser.parse(xml)?.xmeml?.sequence?.media ?? {};
	const tracks = {
		video: tracksOf(media.video),
		audio: tracksOf(media.audio),
	};
	const files = fileDefinitions(
		[...tracks.video, ...tracks.audio].flatMap((track) => track.clipitem ?? []),
	);

	const labels = new Map<string, XmlClip>();
	for (const type of ["video", "audio"] as const) {
		tracks[type].filter(isFirstPart).forEach((track, t) => {
			(track.clipitem ?? []).forEach((clip, i) => {
				labels.set(`${type}${t + 1}.${i + 1}`, {
					name: clip.name ?? "",
					label: clip.labels?.label2 ?? null,
					mediaType: mediaTypeOf(clip, files),
				});
			});
		});
	}
	return labels;
}
