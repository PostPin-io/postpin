interface TrackConfig {
	codec: string;
	bitRate: number;
}

export interface TranscodeMessage {
	mediaId: string;
	renditions: (TrackConfig & {
		width: number;
		height: number;
	})[];
	audio: TrackConfig;
}

export interface ThumbnailMessage {
	mediaId: string;
	frame: number;
	size:
		| {
				width: number;
		  }
		| {
				height: number;
		  }
		| {
				width: number;
				height: number;
		  };
}

export interface ProbeMessage {
	mediaId: string;
}

export interface SetMediaProcessingDoneMessage {
	mediaId: string;
}

export interface SeekSpritesMessage {
	mediaId: string;
}

export interface ShotThumbnailsMessage {
	mediaId: string;
	/** Only publishes while it is still the media's shotThumbnailsGeneration */
	generation: string;
}

export interface MovieBarcodeMessage {
	mediaId: string;
}

export interface SceneDetectMessage {
	mediaId: string;
}

export type CleanupMessage = Record<string, never>;
