import type { Rendition } from "@postpin-io/shared/media/hls";
import type { HlsInfo } from "@postpin-io/shared/types/HlsIndex";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { type ProbedMedia } from "@postpin-io/shared/media/probe";

export interface PaletteColor {
	id: string;
	hex: string;
	/**
	 * display name, when the id isn't one (e.g. Pro Tools color indices)
	 */
	name?: string;
}

export type ColorPalette = PaletteColor[] | "rgb";

export interface Capabilities {
	/**
	 * host name shown to users, e.g. "Resolve" or "Pro Tools"
	 */
	hostName: string;
	/**
	 * fixed host colours, or "rgb" when the host takes any colour (Reaper)
	 */
	palette: ColorPalette;
	renderPresets: boolean;
	renderToDisk: boolean;
	snapshotClips: boolean;
	/**
	 * whether the host has a native custom data field; adapters without one emulate it,
	 * e.g. with a tag in the marker comment that users can see
	 */
	customMarkerData: boolean;
}

export interface NleMarker {
	/**
	 * stable id of the marker in the NLE, unique within the timeline. PostPin stores it as the
	 * marker's nleId to recognize markers it already has. For setMarkers: the marker to update,
	 * null to add a new one.
	 */
	nleId: string | null;
	title: string;
	description: string;
	/**
	 * absolute timeline frame; adapters convert from their own units
	 */
	frame: number;
	/**
	 * length in frames, 0 = point marker. Left out: new markers get 0, existing ones keep theirs.
	 */
	duration?: number;
	/**
	 * palette id, or "#rrggbb" when palette is "rgb"
	 */
	color: string;
	/**
	 * custom data, or null when the marker has none. Adapters must round-trip it,
	 * natively or emulated (see Capabilities.customMarkerData)
	 */
	customData: string | null;
}

export interface RenderProgress {
	percent: number;
	estimatedTimeRemainingMs: number;
}

export interface UploadPartUrl {
	partNumber: number;
	url: string;
}

export interface UploadedPart {
	partNumber: number;
	etag: string;
}

export interface UploadProgress {
	uploadedBytes: number;
	totalBytes: number;
}

export interface Settings {
	renderToDisk: boolean;
	outputPath: string;
	filename: string;
}

export interface LoginCode {
	userCode: string;
	verificationUri: string;
}

export interface TimelineInfo {
	name: string;
	id: string;
	projectId: string;
	projectName: string;
	thumbnailDataUrl?: string;
}

// Communication to the editor plugin
export interface NleBridge {
	getCapabilities(): Promise<Capabilities>;
	getProjectId(): Promise<string>;
	getTimelineInfo(): Promise<TimelineInfo | null>;
	getMarkers(): Promise<NleMarker[]>;
	/**
	 * writes the markers and returns their ids, in the same order. A marker whose nleId still exists
	 * in the timeline is updated (and moved to its frame), the others are added.
	 * Throws when some markers couldn't be written, after writing the rest.
	 */
	setMarkers(markers: NleMarker[]): Promise<string[]>;
	clearMarkers(): Promise<void>;
	getRenderPresets(): Promise<string[]>;
	renderPreview(onProgress: (progress: RenderProgress) => void): Promise<string>;
	buildTimelineSnapshot(): Promise<TimelineSnapshot | null>;
}

// Communication to the host app
export interface HostBridge {
	getServerUrl(): Promise<string>;
	getDefaultServerUrl(): Promise<string>;
	getSession(): Promise<unknown>;
	/**
	 * empty serverUrl selects the hosted server
	 */
	login(serverUrl: string, onCode: (code: LoginCode) => void): Promise<void>;
	logout(): Promise<void>;
	/**
	 * returns an unsubscribe function
	 */
	onSessionChanged(listener: (session: unknown) => void): () => void;
	getSettings(): Promise<Settings>;
	saveSettings(settings: Settings): Promise<void>;
	getFileSize(path: string): Promise<number>;
	uploadFile(
		path: string,
		partSize: number,
		parts: UploadPartUrl[],
		onProgress: (progress: UploadProgress) => void,
	): Promise<UploadedPart[]>;
	/**
	 * a path on the PostPin server, or an absolute https URL elsewhere (e.g. a release download)
	 */
	openInBrowser(path: string): Promise<void>;
	pickDirectory(): Promise<string>;
	/**
	 * progress bar on the app's dock / taskbar icon, 0 to 1, null removes it
	 */
	setProgress(fraction: number | null): Promise<void>;
	/** Session token for the api, null if not signed in */
	getToken(): Promise<string | null>;

	// Encoding the review proxies with the bundled ffmpeg. Hosts without it leave these out, then
	// the server encodes.
	/** size, rotation and audio of a rendered file */
	probe?(path: string): Promise<ProbedMedia>;
	/**
	 * encodes `input` with hlsArgs() into temporary files, one per rendition in the same order;
	 * `onProgress` gets 0 to 1
	 */
	transcode?(
		input: string,
		renditions: Rendition[],
		hasAudio: boolean,
		onProgress: (fraction: number) => void,
	): Promise<EncodedProxy[]>;
	/** deletes a file transcode() wrote */
	removeFile?(path: string): Promise<void>;

	/** Only for hosts that update themselves (PostPin Desktop) */
	updater?: Updater;
}

export type { ProbedMedia };

export interface EncodedProxy {
	path: string;
	/** byte ranges from the playlist, see parseHlsPlaylist() */
	hls: HlsInfo;
	bytes: number;
}

export interface AvailableUpdate {
	/** release, e.g. "1.4.2" */
	version: string;
	/** the API version the release speaks, null when it couldn't be read */
	apiVersion: number | null;
}

export interface Updater {
	/** the newest release when it's newer than the running one, else null */
	check(): Promise<AvailableUpdate | null>;
	/** downloads the update check() found */
	download(onProgress: (fraction: number) => void): Promise<void>;
	/** quits and restarts into the downloaded update */
	install(): Promise<void>;
}
