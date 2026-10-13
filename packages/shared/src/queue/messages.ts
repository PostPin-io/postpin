interface TrackConfig {
	codec: string;
	bitRate: number;
}

export interface TranscodeMessage {
	videoId: string;
	video: TrackConfig & {
		width: number;
		height: number;
	};
	audio: TrackConfig;
}

export interface ThumbnailMessage {
	videoId: string;
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
	videoId: string;
}

export interface SetVideoProcessingDoneMessage {
	videoId: string;
}
