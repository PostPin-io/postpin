interface TrackConfig {
	codec: string;
	bitRate: number;
}

export interface TranscodeMessage {
	mediaId: string;
	video: TrackConfig & {
		width: number;
		height: number;
	};
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
}
