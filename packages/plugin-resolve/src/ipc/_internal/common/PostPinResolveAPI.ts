/* eslint-disable */

export interface IPCStore<T> {
	getState(): Promise<T>;
	getStateSync(): T;
	onStateChange(fn: (newState: T) => void): () => void;
}
export interface Settings {
	renderToDisk: boolean;
	outputPath: string;
	filename: string;
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
export interface Marker {
	title: string;
	description: string;
	frame: number;
	color: MarkerColor;
	customData: string;
}
export enum MarkerColor {
	Blue = "Blue",
	Cyan = "Cyan",
	Green = "Green",
	Yellow = "Yellow",
	Red = "Red",
	Pink = "Pink",
	Purple = "Purple",
	Fuchsia = "Fuchsia",
	Rose = "Rose",
	Lavender = "Lavender",
	Sky = "Sky",
	Mint = "Mint",
	Lemon = "Lemon",
	Sand = "Sand",
	Cocoa = "Cocoa",
	Cream = "Cream",
}
export interface LoginConfig {
	serverBaseUrl: string;
}
export interface LoginCode {
	userCode: string;
	verificationUri: string;
}
export interface IMainAPIImpl {
	getRenderPresets(): Promise<string[]> | string[];
	renderPreview(targetDirPath: string, targetClipName: string): Promise<string> | string;
	getFileSize(path: string): Promise<number> | number;
	uploadRenderedFile(
		sourcePath: string,
		partSize: number,
		parts: UploadPartUrl[],
	): Promise<UploadedPart[]> | UploadedPart[];
	openInBrowser(path: string): Promise<boolean> | boolean;
	buildTimelineSnapshot(): Promise<unknown> | unknown;
	getLastSettings(): Promise<Settings> | Settings;
	saveSettings(settings: Settings): Promise<boolean> | boolean;
	pickOutputDirectory(): Promise<string> | string;
	getMarkers(): Promise<Marker[]> | Marker[];
	setMarkers(markers: Marker[]): Promise<boolean> | boolean;
	setMarker(marker: Marker): Promise<boolean> | boolean;
	clearMarkers(): Promise<boolean> | boolean;
	deleteMarker(frame: number): Promise<boolean> | boolean;
	getTimelineStartFrame(): Promise<number> | number;
	test(): Promise<boolean> | boolean;
	getProjectId(): Promise<string> | string;
	getTimelineId(): Promise<string> | string;
	getSession(): Promise<unknown> | unknown;
	getSessionToken(): Promise<string> | string;
	logout(): Promise<boolean> | boolean;
	login(config: LoginConfig): Promise<boolean> | boolean;
}
export interface IMainAPIRenderer {
	getRenderPresets(): Promise<string[]>;
	renderPreview(targetDirPath: string, targetClipName: string): Promise<string>;
	getFileSize(path: string): Promise<number>;
	uploadRenderedFile(
		sourcePath: string,
		partSize: number,
		parts: UploadPartUrl[],
	): Promise<UploadedPart[]>;
	openInBrowser(path: string): Promise<boolean>;
	buildTimelineSnapshot(): Promise<unknown>;
	getLastSettings(): Promise<Settings>;
	saveSettings(settings: Settings): Promise<boolean>;
	pickOutputDirectory(): Promise<string>;
	getMarkers(): Promise<Marker[]>;
	setMarkers(markers: Marker[]): Promise<boolean>;
	setMarker(marker: Marker): Promise<boolean>;
	clearMarkers(): Promise<boolean>;
	deleteMarker(frame: number): Promise<boolean>;
	getTimelineStartFrame(): Promise<number>;
	test(): Promise<boolean>;
	getProjectId(): Promise<string>;
	getTimelineId(): Promise<string>;
	getSession(): Promise<unknown>;
	getSessionToken(): Promise<string>;
	logout(): Promise<boolean>;
	login(config: LoginConfig): Promise<boolean>;
	onRenderProgress(fn: (progress: RenderProgress) => void): () => void;
	onUploadProgress(fn: (progress: UploadProgress) => void): () => void;
	onLoginCode(fn: (code: LoginCode) => void): () => void;
	onSessionChanged(fn: (session: unknown) => void): () => void;
}
