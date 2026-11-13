/* eslint-disable */

export interface IPCStore<T> {
	getState(): Promise<T>;
	getStateSync(): T;
	onStateChange(fn: (newState: T) => void): () => void;
}
export interface PaletteColor {
	id: string;
	hex: string;
	name?: string;
}
export interface Capabilities {
	hostName: string;
	palette: PaletteColor[];
	anyColor: boolean;
	renderPresets: boolean;
	renderToDisk: boolean;
	snapshotClips: boolean;
	customMarkerData: boolean;
}
export interface NleMarker {
	nleId?: string;
	title: string;
	description: string;
	frame: number;
	color: string;
	customData?: string;
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
export interface LoginConfig {
	serverBaseUrl: string;
}
export interface LoginCode {
	userCode: string;
	verificationUri: string;
}
export interface ProbedMedia {
	width: number;
	height: number;
	rotation?: number;
	hasAudio: boolean;
	duration?: number;
}
export interface Rendition {
	width: number;
	height: number;
	bitRate: number;
}
export interface HlsRange {
	offset: number;
	length: number;
}
export interface HlsSegment {
	duration: number;
	offset: number;
	length: number;
}
export interface HlsInfo {
	init: HlsRange;
	segments: HlsSegment[];
}
export interface EncodedProxy {
	path: string;
	hls: HlsInfo;
	bytes: number;
}
export interface ICommonAPIImpl {
	getServerUrl(): Promise<string> | string;
	getDefaultServerUrl(): Promise<string> | string;
	getSession(): Promise<unknown> | unknown;
	getToken(): Promise<string | null> | string | null;
	login(config: LoginConfig): Promise<boolean> | boolean;
	logout(): Promise<boolean> | boolean;
	getSettings(): Promise<Settings> | Settings;
	saveSettings(settings: Settings): Promise<boolean> | boolean;
	getFileSize(path: string): Promise<number> | number;
	uploadFile(
		path: string,
		partSize: number,
		parts: UploadPartUrl[],
	): Promise<UploadedPart[]> | UploadedPart[];
	openInBrowser(path: string): Promise<boolean> | boolean;
	pickDirectory(): Promise<string> | string;
	setProgress(fraction: number): Promise<boolean> | boolean;
	canTranscode(): Promise<boolean> | boolean;
	probe(path: string): Promise<ProbedMedia> | ProbedMedia;
	transcode(
		input: string,
		renditions: Rendition[],
		hasAudio: boolean,
	): Promise<EncodedProxy[]> | EncodedProxy[];
	removeFile(path: string): Promise<boolean> | boolean;
}
export interface ICommonAPIRenderer {
	getServerUrl(): Promise<string>;
	getDefaultServerUrl(): Promise<string>;
	getSession(): Promise<unknown>;
	getToken(): Promise<string | null>;
	login(config: LoginConfig): Promise<boolean>;
	logout(): Promise<boolean>;
	getSettings(): Promise<Settings>;
	saveSettings(settings: Settings): Promise<boolean>;
	getFileSize(path: string): Promise<number>;
	uploadFile(path: string, partSize: number, parts: UploadPartUrl[]): Promise<UploadedPart[]>;
	openInBrowser(path: string): Promise<boolean>;
	pickDirectory(): Promise<string>;
	setProgress(fraction: number): Promise<boolean>;
	canTranscode(): Promise<boolean>;
	probe(path: string): Promise<ProbedMedia>;
	transcode(input: string, renditions: Rendition[], hasAudio: boolean): Promise<EncodedProxy[]>;
	removeFile(path: string): Promise<boolean>;
	onLoginCode(fn: (code: LoginCode) => void): () => void;
	onSessionChanged(fn: (session: unknown) => void): () => void;
	onUploadProgress(fn: (progress: UploadProgress) => void): () => void;
	onTranscodeProgress(fn: (fraction: number) => void): () => void;
}
export interface TimelineInfo {
	name: string;
	id: string;
	projectId: string;
	projectName: string;
	thumbnailDataUrl?: string;
}
export interface INleAPIImpl {
	getCapabilities(): Promise<Capabilities> | Capabilities;
	getProjectId(): Promise<string> | string;
	getTimelineInfo(): Promise<TimelineInfo | null> | TimelineInfo | null;
	getMarkers(): Promise<NleMarker[]> | NleMarker[];
	setMarkers(markers: NleMarker[]): Promise<string[]> | string[];
	clearMarkers(): Promise<boolean> | boolean;
	getRenderPresets(): Promise<string[]> | string[];
	renderPreview(): Promise<string> | string;
	buildTimelineSnapshot(): Promise<unknown> | unknown;
}
export interface INleAPIRenderer {
	getCapabilities(): Promise<Capabilities>;
	getProjectId(): Promise<string>;
	getTimelineInfo(): Promise<TimelineInfo | null>;
	getMarkers(): Promise<NleMarker[]>;
	setMarkers(markers: NleMarker[]): Promise<string[]>;
	clearMarkers(): Promise<boolean>;
	getRenderPresets(): Promise<string[]>;
	renderPreview(): Promise<string>;
	buildTimelineSnapshot(): Promise<unknown>;
	onRenderProgress(fn: (progress: RenderProgress) => void): () => void;
}
