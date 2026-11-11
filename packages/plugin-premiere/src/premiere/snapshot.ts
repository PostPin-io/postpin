// The sequence as a TimelineSnapshot, built like Resolve's: enabled clips on enabled tracks, with
// their media. Premiere has no ids for track items, so clips are numbered per track.
import type {
	AudioClipTrackItem,
	ProjectItem,
	Sequence,
	VideoClipTrackItem,
} from "@adobe/premierepro";
import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import type {
	Clip,
	ClipColor,
	MediaItem,
	TimelineSnapshot,
	Track,
	TrackType,
} from "@postpin-io/shared/types/TimelineSnapshot";
import { ppro } from "../host";
import { fps, fpsToFrameRate, TICKS_PER_SECOND, toFrame, type Timing } from "./time";
import { clipLabels, type XmlClip } from "./fcpxml";
import { exportSequenceXml, readLabelPrefs } from "../bridges/store";
import { DEFAULT_LABEL_PREFS, labelColor } from "./labels";

// Project panel column with the media's start time in ticks, as Adobe's samples read it
const MEDIA_START_COLUMN = "Column.Intrinsic.MediaStart";

type TrackItem = VideoClipTrackItem | AudioClipTrackItem;

interface MetadataColumn {
	ColumnID: string;
	ColumnName?: string;
	ColumnValue: string;
}

interface ConvertedMedia {
	item: MediaItem;
	// the media's start timecode in seconds, source in points are relative to it
	startSeconds: number;
}

const seconds = (ticks: string) => Number(BigInt(ticks)) / Number(TICKS_PER_SECOND);

export async function buildTimelineSnapshot(
	sequence: Sequence,
	timing: Timing,
): Promise<TimelineSnapshot> {
	// promises, so clips of the same media converting in parallel share one conversion
	const media = new Map<string, Promise<ConvertedMedia | null>>();

	// The API has no labels for track items, only Final Cut Pro XML has them.
	// Started first, it runs while the tracks are read.
	const xmlClips = exportSequenceXml(sequence)
		.then(clipLabels)
		.catch((error) => {
			console.warn("No clip colors, the XML export failed:", error);
			return new Map<string, XmlClip>();
		});

	const labelPrefs = readLabelPrefs().catch((error) => {
		console.warn("Premiere's factory label settings, reading the preferences failed:", error);
		return DEFAULT_LABEL_PREFS;
	});

	function mediaFor(projectItem: ProjectItem, type: TrackType) {
		const id = projectItem.getId();
		let converted = media.get(id);
		if (!converted) {
			converted = convertMedia(projectItem, id, type).catch((error) => {
				console.warn(`Couldn't read the media of ${projectItem.name}:`, error);
				return null;
			});
			media.set(id, converted);
		}
		return converted;
	}

	// The XML has a clip's label only when it isn't the default for its media type
	async function clipColor(id: string, name: string): Promise<ClipColor | null> {
		const xmlClip = (await xmlClips).get(id);
		// A different name means the XML numbers clips differently, so its label is another clip's
		if (xmlClip?.name !== name) return null;
		return labelColor(await labelPrefs, xmlClip);
	}

	async function convertMedia(
		projectItem: ProjectItem,
		id: string,
		type: TrackType,
	): Promise<ConvertedMedia | null> {
		const clip = ppro.ClipProjectItem.cast(projectItem);
		if (!clip) return null;
		const isSequence = await clip.isSequence();
		const filePath = isSequence ? "" : await clip.getMediaFilePath();
		// titles, graphics and other synthetic items have no media
		if (!filePath && !isSequence) return null;

		const [interpretation, columnsJson] = await Promise.all([
			clip.getFootageInterpretation(),
			ppro.Metadata.getProjectColumnsMetadata(projectItem),
		]);
		const columns: MetadataColumn[] = JSON.parse(columnsJson);
		const startTicks = columns.find((c) => c.ColumnID === MEDIA_START_COLUMN)?.ColumnValue;
		const startSeconds = startTicks ? seconds(startTicks) : 0;

		const mediaFps = interpretation.getFrameRate();
		// Audio-only media has no frame rate of its own
		const frameRate =
			mediaFps > 0 && mediaFps <= 1000 ? fpsToFrameRate(mediaFps, false) : timing.frameRate;
		const startFrame = Math.round(startSeconds * fps(frameRate));

		return {
			startSeconds,
			item: {
				id,
				name: projectItem.name,
				type,
				filePath,
				frameRate,
				startTimecode: formatTimecode(startFrame, frameRate),
				metadata: Object.fromEntries(
					columns.map((c) => [c.ColumnName || c.ColumnID, c.ColumnValue]),
				),
			},
		};
	}

	async function convertClip(item: TrackItem, id: string, type: TrackType): Promise<Clip | null> {
		if (await item.isDisabled()) return null;

		const [start, end, inPoint, speed, reversed, name, projectItem] = await Promise.all([
			item.getStartTime(),
			item.getEndTime(),
			item.getInPoint(),
			item.getSpeed(),
			item.isSpeedReversed(),
			item.getName(),
			item.getProjectItem(),
		]);
		const [converted, color] = await Promise.all([
			projectItem ? mediaFor(projectItem, type) : null,
			clipColor(id, name),
		]);

		// In points are relative to the media start, source frames are absolute like Resolve's
		const sourceStartFrameIndex = converted
			? Math.floor(
					(converted.startSeconds + seconds(inPoint.ticks)) * fps(converted.item.frameRate) + 0.001,
				)
			: null;
		const startFrameIndex = toFrame(start, timing);

		return {
			id,
			name,
			mediaId: converted?.item.id ?? null,
			startFrameIndex,
			durationFrameCount: toFrame(end, timing) - startFrameIndex,
			sourceStartFrameIndex,
			speed: Math.round(speed * 1e4) / 1e4,
			metadata: reversed ? { reversed: true } : {},
			color,
		};
	}

	async function convertTrack(type: TrackType, index: number): Promise<Track> {
		const track =
			type === "video" ? await sequence.getVideoTrack(index) : await sequence.getAudioTrack(index);
		const number = index + 1;
		// a muted track is one whose output is switched off, it isn't in the export
		const items: TrackItem[] = (await track.isMuted())
			? []
			: track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
		const clips = await Promise.all(
			items.map((item, i) => convertClip(item, `${type}${number}.${i + 1}`, type)),
		);
		return {
			// same ids as Resolve's
			id: `${type}${number}`,
			type,
			name: track.name || `${type === "video" ? "V" : "A"}${number}`,
			clips: clips.filter((clip) => clip !== null),
		};
	}

	const [end, videoCount, audioCount] = await Promise.all([
		sequence.getEndTime(),
		sequence.getVideoTrackCount(),
		sequence.getAudioTrackCount(),
	]);
	const tracks = await Promise.all([
		...Array.from({ length: videoCount }, (_, i) => convertTrack("video", i)),
		...Array.from({ length: audioCount }, (_, i) => convertTrack("audio", i)),
	]);
	const mediaItems = (await Promise.all(media.values())).flatMap((m) => (m ? [m.item] : []));

	return {
		id: sequence.guid.toString(),
		name: sequence.name,
		tracks,
		mediaItems,
		frameRate: timing.frameRate,
		startFrameIndex: timing.startFrame,
		// the sequence ends with its last clip
		durationFrameCount: toFrame(end, timing) - timing.startFrame,
		metadata: {},
	};
}
