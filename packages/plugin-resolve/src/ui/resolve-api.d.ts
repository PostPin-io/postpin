// Mirrors what src/electron/preload.js exposes via contextBridge.
interface ResolveAPI {
	openPage(pageName: string): Promise<boolean>;
	createProject(projectName: string): Promise<unknown>;
	saveProject(): Promise<boolean>;
	openProject(projectName: string): Promise<unknown>;
	createBin(binName: string): Promise<unknown>;
	selectBin(binName: string): Promise<boolean>;
	deleteBin(binName: string): Promise<boolean>;
	addClips(filePaths: string[]): Promise<unknown>;
	createTimeline(timelineName: string): Promise<unknown>;
	selectTimeline(timelineName: string): Promise<boolean>;
	renderTimeline(
		timelineName: string,
		renderPresetName: string,
		targetDirPath: string,
		targetClipName: string,
	): Promise<boolean>;
	getRenderPresets(): Promise<string[] | null>;
}

interface Window {
	resolveAPI: ResolveAPI;
}
