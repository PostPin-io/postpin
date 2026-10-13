/* eslint-disable */

export interface IPCStore<T> {
	getState(): Promise<T>;
	getStateSync(): T;
	onStateChange(fn: (newState: T) => void): () => void;
}
export interface ISettingsImpl {
	getRenderPresets(): Promise<string[]> | string[];
	renderTimeline(
		timelineName: string,
		renderPresetName: string,
		targetDirPath: string,
		targetClipName: string,
	): Promise<string> | string;
	uploadRenderedFile(sourcePath: string, uploadUrl: string): Promise<boolean> | boolean;
	openInBrowser(path: string): Promise<boolean> | boolean;
}
export interface ISettingsRenderer {
	getRenderPresets(): Promise<string[]>;
	renderTimeline(
		timelineName: string,
		renderPresetName: string,
		targetDirPath: string,
		targetClipName: string,
	): Promise<string>;
	uploadRenderedFile(sourcePath: string, uploadUrl: string): Promise<boolean>;
	openInBrowser(path: string): Promise<boolean>;
}
