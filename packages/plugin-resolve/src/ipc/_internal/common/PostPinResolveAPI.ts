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
	onRenderProgress(fn: (progress: RenderProgress) => void): () => void;
	onUploadProgress(fn: (progress: UploadProgress) => void): () => void;
}
