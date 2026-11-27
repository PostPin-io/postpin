// Pure conversions between the bridge script's JSON (postpin_bridge.lua) and PostPin's types.
// REAPER counts in seconds from the project start; PostPin in absolute frames.

import type { NleMarker } from "@postpin-io/plugin-core/bridge";
import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import type {
	Clip,
	FrameRate,
	MediaItem,
	TimelineSnapshot,
	Track,
} from "@postpin-io/shared/types/TimelineSnapshot";

/** command "project" */
export interface ProjectInfo {
	/** PostPin's id in the project's ExtState, kept by Save As */
	id: string;
	/** the .rpp, empty while unsaved */
	path: string;
	name: string;
	frameRate: number;
	dropFrame: boolean;
	/** seconds: the project's time 0 shows as this time */
	offset: number;
	length: number;
}

/** command "markers" */
export interface BridgeMarker {
	guid: string;
	isRegion: boolean;
	start: number;
	end: number;
	name: string;
	number: number;
	/** "#rrggbb", null for REAPER's default colour */
	color: string | null;
	description: string;
	customData?: string | null;
}

/** a marker for command "setMarkers" */
export interface BridgeMarkerInput {
	/** to update, left out to add */
	guid?: string;
	name: string;
	description: string;
	customData: string | null;
	start: number;
	/** left out: a range keeps its length; equal to start or left out on add: a point marker */
	end?: number;
	/** left out: REAPER's default colour */
	color?: string;
}

/** command "snapshot" */
export interface BridgeSnapshot {
	project: ProjectInfo;
	tracks: {
		guid: string;
		name: string;
		hasVideo: boolean;
		items: {
			guid: string;
			name: string;
			start: number;
			length: number;
			sourceOffset: number;
			rate: number;
			file: string | null;
			/** REAPER's source type, "VIDEO" for video files */
			sourceType: string;
			color: string | null;
		}[];
	}[];
}

/**
 * REAPER's default marker colour (default theme), for markers without their own. A marker that
 * comes back with it keeps the default instead of getting it as its own colour.
 */
export const DEFAULT_MARKER_COLOR = "#ff0000";

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

// NTSC rates: REAPER reports them rounded (29.97), PostPin needs the exact fraction
const NTSC = [24, 30, 48, 60, 120];

export function parseFrameRate(fps: number, dropFrame: boolean): FrameRate {
	for (const base of NTSC) {
		if (Math.abs(fps - (base * 1000) / 1001) < 0.005) {
			return { fpsNumerator: base * 1000, fpsDenominator: 1001, dropFrame };
		}
	}
	if (Math.abs(fps - Math.round(fps)) < 0.0005) {
		return { fpsNumerator: Math.round(fps), fpsDenominator: 1, dropFrame: false };
	}
	return { fpsNumerator: Math.round(fps * 1000), fpsDenominator: 1000, dropFrame: false };
}

/** "Song.rpp" → "Song"; an unsaved project has no name yet */
export const displayName = (project: ProjectInfo) =>
	project.name.replace(/\.rpp$/i, "") || "Unsaved project";

export const fpsOf = (rate: FrameRate) => rate.fpsNumerator / rate.fpsDenominator;

/** The project's timing: absolute frames from REAPER's seconds and back */
export function timingOf(project: ProjectInfo) {
	const frameRate = parseFrameRate(project.frameRate, project.dropFrame);
	const fps = fpsOf(frameRate);
	const startFrame = Math.round(project.offset * fps);
	return {
		frameRate,
		startFrame,
		/** absolute frame of a project time */
		frameAt: (seconds: number) => startFrame + Math.round(seconds * fps),
		/** project time of an absolute frame */
		secondsAt: (frame: number) => (frame - startFrame) / fps,
		/** a length in frames */
		frames: (seconds: number) => Math.round(seconds * fps),
	};
}

export type Timing = ReturnType<typeof timingOf>;

// ---------------------------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------------------------

export function toNleMarker(marker: BridgeMarker, timing: Timing): NleMarker {
	return {
		nleId: marker.guid,
		title: marker.name,
		description: marker.description,
		frame: timing.frameAt(marker.start),
		duration: marker.isRegion ? Math.max(0, timing.frames(marker.end - marker.start)) : 0,
		color: marker.color ?? DEFAULT_MARKER_COLOR,
		customData: marker.customData ?? null,
	};
}

/** For setMarkers; `existing` are the guids still in the project */
export function toBridgeMarker(
	marker: NleMarker,
	timing: Timing,
	existing: Set<string>,
): BridgeMarkerInput {
	const start = timing.secondsAt(marker.frame);
	const update = marker.nleId !== null && existing.has(marker.nleId);
	const color = marker.color.toLowerCase();
	return {
		...(update ? { guid: marker.nleId! } : {}),
		name: marker.title,
		description: marker.description,
		customData: marker.customData,
		start,
		// left out: an existing range keeps its length
		...(marker.duration !== undefined
			? { end: start + marker.duration / fpsOf(timing.frameRate) }
			: {}),
		...(/^#[0-9a-f]{6}$/.test(color) && color !== DEFAULT_MARKER_COLOR ? { color } : {}),
	};
}

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------

/**
 * REAPER's "Video (ffmpeg/libav encoder)" sink configuration for RENDER_FORMAT: MP4 with H.264
 * and AAC. Laid out as REAPER stores it (checked with REAPER 7.86): container, video codec,
 * video kbit/s, audio codec, audio kbit/s, width, height, fps as float, keep aspect ratio.
 * REAPER can't take the size from the video, so it's always 1080p and the video is scaled in.
 */
export function videoRenderFormat(fps: number): string {
	const config = Buffer.alloc(46);
	config.write("PMFF", 0, "latin1");
	const ints = [7, 0, 8000, 0, 192, 1920, 1080];
	ints.forEach((value, i) => config.writeInt32LE(value, 4 + i * 4));
	config.writeFloatLE(fps, 32);
	config.writeInt32LE(1, 36);
	config.writeInt32LE(0x5f, 40);
	return config.toString("base64");
}

// ---------------------------------------------------------------------------------------------
// Timeline snapshot
// ---------------------------------------------------------------------------------------------

/**
 * Tracks with their items. A REAPER track holds any media: it's a video track when it has a
 * video item. Media frames count in the project rate, REAPER has no source timecode.
 */
export function buildSnapshot(snapshot: BridgeSnapshot): TimelineSnapshot {
	const timing = timingOf(snapshot.project);
	const mediaItems = new Map<string, MediaItem>();
	let end = timing.startFrame;

	const tracks = snapshot.tracks.map((track): Track => {
		const type = track.hasVideo ? "video" : "audio";
		return {
			id: track.guid,
			type,
			name: track.name,
			clips: track.items.map((item): Clip => {
				if (item.file && !mediaItems.has(item.file)) {
					mediaItems.set(item.file, {
						id: item.file,
						name: item.file.split(/[\\/]/).pop() ?? item.file,
						type: item.sourceType === "VIDEO" ? "video" : "audio",
						filePath: item.file,
						frameRate: timing.frameRate,
						startTimecode: formatTimecode(0, timing.frameRate),
						metadata: { sourceType: item.sourceType },
					});
				}
				const start = timing.frameAt(item.start);
				const duration = timing.frames(item.length);
				end = Math.max(end, start + duration);
				return {
					id: item.guid,
					name: item.name,
					mediaId: item.file,
					startFrameIndex: start,
					durationFrameCount: duration,
					sourceStartFrameIndex: item.file ? timing.frames(item.sourceOffset) : null,
					speed: item.rate,
					metadata: {},
					color: item.color ? { name: item.color, hex: item.color } : null,
				};
			}),
		};
	});

	return {
		id: snapshot.project.id,
		name: displayName(snapshot.project),
		// video tracks first, like the other hosts
		tracks: [
			...tracks.filter((t) => t.type === "video"),
			...tracks.filter((t) => t.type === "audio"),
		],
		mediaItems: [...mediaItems.values()],
		frameRate: timing.frameRate,
		startFrameIndex: timing.startFrame,
		durationFrameCount: end - timing.startFrame,
		metadata: { host: "REAPER" },
	};
}
