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

// Communication to the editor plugin
export interface NleBridge {
	getCapabilities(): Promise<Capabilities>;
	getProjectId(): Promise<string>;
	getTimelineId(): Promise<string>;
	getMarkers(): Promise<NleMarker[]>;
	setMarkers(markers: NleMarker[]): Promise<void>;
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
}
