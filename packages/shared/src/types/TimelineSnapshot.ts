// Editing-software independent snapshot of a timeline's contents at export time, stored as one
// JSON blob on the export. All ids are the ids of the editing software the timeline came from. Frame indices are absolute: a timeline starting at
// 01:00:00:00 at 24 fps begins at frame 86400.

export type FrameRate = {
	fpsNumerator: number;
	fpsDenominator: number;
	dropFrame: boolean;
};

export type TimelineSnapshot = {
	id: string;
	name: string;
	tracks: Track[];
	mediaItems: MediaItem[];
	frameRate: FrameRate;
	startTimecode: string;
	metadata: Record<string, unknown>;
};

export type TrackType = "video" | "audio";

export type Track = {
	id: string;
	type: TrackType;
	name: string;
	/** Disabled clips are left out */
	clips: Clip[];
};

export type Clip = {
	id: string;
	name: string;
	/** null for generators and titles */
	mediaId: string | null;
	startFrameIndex: number;
	durationFrameCount: number;
	/** null without media */
	sourceStartFrameIndex: number | null;
	/** Constant playback speed, 1 is normal speed. Speed ramps aren't supported. */
	speed: number;
	metadata: Record<string, unknown>;
};

export type MediaItem = {
	id: string;
	name: string;
	type: "video" | "audio";
	filePath: string;
	/** Source frame indices count in this rate */
	frameRate: FrameRate;
	startTimecode: string;
	metadata: Record<string, unknown>;
};
