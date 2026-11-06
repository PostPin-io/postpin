import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

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
	openInBrowser(path: string): Promise<void>;
	pickDirectory(): Promise<string>;
	/**
	 * progress bar on the app's dock / taskbar icon, 0 to 1, null removes it
	 */
	setProgress(fraction: number | null): Promise<void>;
	/** Session token for the api, null if not signed in */
	getToken(): Promise<string | null>;
}
