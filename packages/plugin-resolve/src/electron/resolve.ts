// Types for the DaVinci Resolve scripting API, as exposed to Workflow Integration plugins via
// WorkflowIntegration.node. Derived from the Resolve Developer docs:
//   /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/README.txt (7 May 2025)
//   /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/README.txt
//
// The docs describe the Python API. In the sandboxed Electron model every call returns a Promise
// (see Examples/SamplePlugin/main.js). Python `None` arrives as null/undefined, so object getters
// are typed as nullable. Indices are 1-based throughout.

type P<T> = Promise<T>;
type Maybe<T> = P<T | null | undefined>;

// ---------------------------------------------------------------------------
// WorkflowIntegration.node module

export type WorkflowIntegrationCallback = "RenderStart" | "RenderStop";

export interface WorkflowIntegrationModule {
	/** pluginId must match the id in manifest.xml. */
	Initialize(pluginId: string): P<boolean>;
	GetResolve(): Maybe<Resolve>;
	RegisterCallback(callbackName: WorkflowIntegrationCallback, callbackFunc: () => void): P<boolean>;
	DeregisterCallback(callbackName: WorkflowIntegrationCallback): P<boolean>;
	/** Call on plugin quit. */
	CleanUp(): boolean;
	/** 0 disables the timeout (default). */
	SetAPITimeout(valueInSecs: number): P<boolean>;
}

// ---------------------------------------------------------------------------
// Shared value types

export type PageName = "media" | "cut" | "edit" | "fusion" | "color" | "fairlight" | "deliver";
export type TrackType = "audio" | "video" | "subtitle";
export type MarkType = "video" | "audio" | "all";
/** 0 - local, 1 - remote */
export type VersionType = 0 | 1;

export type AudioSubTrackType =
	| "mono"
	| "stereo"
	| "lrc"
	| "lcr"
	| "lrcs"
	| "lcrs"
	| "quad"
	| "5.0"
	| "5.0film"
	| "5.1"
	| "5.1film"
	| "7.0"
	| "7.0film"
	| "7.1"
	| "7.1film"
	| `adaptive${number}`;

/** Marker colors as shown in the Resolve UI. */
export type MarkerColor =
	| "Blue"
	| "Cyan"
	| "Green"
	| "Yellow"
	| "Red"
	| "Pink"
	| "Purple"
	| "Fuchsia"
	| "Rose"
	| "Lavender"
	| "Sky"
	| "Mint"
	| "Lemon"
	| "Sand"
	| "Cocoa"
	| "Cream";

export interface MarkerInfo {
	color: MarkerColor;
	duration: number;
	note: string;
	name: string;
	customData: string;
}

/** frameId -> marker info */
export type Markers = Record<number, MarkerInfo>;

export interface MarkInOut {
	video?: { in: number; out: number };
	audio?: { in: number; out: number };
}

export interface DatabaseInfo {
	DbType: "Disk" | "PostgreSQL";
	DbName: string;
	/** Defaults to 127.0.0.1 */
	IpAddress?: string;
}

/** Keys are the resolve.CLOUD_SETTING_* constants. */
export type CloudSettings = Record<number | string, string | boolean | number>;
/** Keys are the resolve.AUDIO_SYNC_* constants. */
export type AudioSyncSettings = Record<number | string, number | boolean>;
/** Keys are the resolve.SUBTITLE_* constants. */
export type AutoCaptionSettings = Record<number | string, number>;

export interface Resolution {
	Width: number;
	Height: number;
}

export interface ThumbnailData {
	width: number;
	height: number;
	format: string;
	/** Base64-encoded RGB 8-bit image data */
	data: string;
}

export interface TakeInfo {
	startFrame: number;
	endFrame: number;
	mediaPoolItem: MediaPoolItem;
}

export interface VersionInfo {
	versionName: string;
	versionType: VersionType;
}

export interface CDLMap {
	NodeIndex: string;
	/** "r g b" */
	Slope: string;
	Offset: string;
	Power: string;
	Saturation: string;
}

export interface StorageItemInfo {
	media: string;
	startFrame: number;
	endFrame: number;
}

export interface AppendClipInfo {
	mediaPoolItem: MediaPoolItem;
	startFrame: number;
	endFrame: number;
	/** 1 - video only, 2 - audio only */
	mediaType?: 1 | 2;
	trackIndex?: number;
	recordFrame?: number;
}

export interface ImportClipInfo {
	FilePath: string;
	StartIndex?: number;
	EndIndex?: number;
}

export interface ImportTimelineOptions {
	timelineName?: string;
	importSourceClips?: boolean;
	sourceClipsPath?: string;
	sourceClipsFolders?: Folder[];
	interlaceProcessing?: boolean;
}

export interface ImportIntoTimelineOptions {
	autoImportSourceClipsIntoMediaPool?: boolean;
	ignoreFileExtensionsWhenMatching?: boolean;
	linkToSourceCameraFiles?: boolean;
	useSizingInfo?: boolean;
	importMultiChannelAudioTracksAsLinkedGroups?: boolean;
	insertAdditionalTracks?: boolean;
	insertWithOffset?: string;
	sourceClipsPath?: string;
	sourceClipsFolders?: Folder[];
}

export interface NewTrackOptions {
	audioType?: AudioSubTrackType;
	index?: number;
}

export interface CompoundClipInfo {
	startTimecode?: string;
	name?: string;
}

// ---------------------------------------------------------------------------
// Rendering

/** See "Looking up Render Settings". */
export interface RenderSettings {
	/** When true, MarkIn and MarkOut are ignored. */
	SelectAllFrames?: boolean;
	MarkIn?: number;
	MarkOut?: number;
	TargetDir?: string;
	CustomName?: string;
	/** 0 - Prefix, 1 - Suffix */
	UniqueFilenameStyle?: 0 | 1;
	ExportVideo?: boolean;
	ExportAudio?: boolean;
	FormatWidth?: number;
	FormatHeight?: number;
	FrameRate?: number;
	/** SD: "16_9" | "4_3", otherwise "square" | "cinemascope" */
	PixelAspectRatio?: "16_9" | "4_3" | "square" | "cinemascope";
	/** 0 = automatic, 1..MAX = bit rate, or a quality level. */
	VideoQuality?: number | "Least" | "Low" | "Medium" | "High" | "Best";
	AudioCodec?: string;
	AudioBitDepth?: number;
	AudioSampleRate?: number;
	ColorSpaceTag?: string;
	GammaTag?: string;
	ExportAlpha?: boolean;
	/** H.264 / H.265 only */
	EncodingProfile?: string;
	/** H.264 only */
	MultiPassEncode?: boolean;
	/** 0 - Premultiplied, 1 - Straight. Requires ExportAlpha. */
	AlphaMode?: 0 | 1;
	/** QuickTime and MP4 only */
	NetworkOptimization?: boolean;
	ClipStartFrame?: number;
	TimelineStartTimecode?: string;
	ReplaceExistingFilesInPlace?: boolean;
}

export interface QuickExportParams {
	TargetDir?: string;
	CustomName?: string;
	VideoQuality?: RenderSettings["VideoQuality"];
	EnableUpload?: boolean;
}

// Render job shapes are not spelled out in the README; fields below are observed at runtime.

export type RenderJobStatusName = "Ready" | "Rendering" | "Complete" | "Failed" | "Cancelled";

export interface RenderJobStatus {
	JobStatus: RenderJobStatusName;
	CompletionPercentage: number;
	EstimatedTimeRemainingInMs?: number;
	TimeTakenToRenderInMs?: number;
	Error?: string;
}

export interface RenderJob {
	JobId: string;
	RenderJobName: string;
	TimelineName: string;
	TargetDir: string;
	OutputFilename: string;
	PresetName: string;
	RenderMode: string;
	VideoFormat: string;
	VideoCodec: string;
	AudioCodec: string;
	FormatWidth: number;
	FormatHeight: number;
	FrameRate: string;
	PixelAspectRatio: number;
	MarkIn: number;
	MarkOut: number;
	IsExportVideo: boolean;
	IsExportAudio: boolean;
	ExportAlpha: boolean;
	AudioBitDepth: number;
	AudioSampleRate: number;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Timeline item properties ("Looking up Timeline item properties")

export interface TimelineItemProperties {
	Pan: number;
	Tilt: number;
	ZoomX: number;
	ZoomY: number;
	ZoomGang: boolean;
	RotationAngle: number;
	AnchorPointX: number;
	AnchorPointY: number;
	Pitch: number;
	Yaw: number;
	FlipX: boolean;
	FlipY: boolean;
	CropLeft: number;
	CropRight: number;
	CropTop: number;
	CropBottom: number;
	CropSoftness: number;
	CropRetain: boolean;
	/** resolve.DYNAMIC_ZOOM_EASE_* */
	DynamicZoomEase: number;
	/** resolve.COMPOSITE_* */
	CompositeMode: number;
	Opacity: number;
	Distortion: number;
	/** resolve.RETIME_* */
	RetimeProcess: number;
	/** resolve.MOTION_EST_* */
	MotionEstimation: number;
	/** resolve.SCALE_* */
	Scaling: number;
	/** resolve.RESIZE_FILTER_* */
	ResizeFilter: number;
}

// ---------------------------------------------------------------------------
// Objects

/** The Fusion object is a separate, much larger API; left untyped. */
export type Fusion = Record<string, any>;
export type FusionComp = Record<string, any>;

export interface Resolve extends ResolveConstants {
	Fusion(): Maybe<Fusion>;
	GetMediaStorage(): Maybe<MediaStorage>;
	GetProjectManager(): Maybe<ProjectManager>;
	OpenPage(pageName: PageName): P<boolean>;
	GetCurrentPage(): P<PageName | null>;
	GetProductName(): P<string>;
	/** [major, minor, patch, build, suffix] */
	GetVersion(): P<[number, number, number, number, string]>;
	/** "major.minor.patch[suffix].build" */
	GetVersionString(): P<string>;
	LoadLayoutPreset(presetName: string): P<boolean>;
	UpdateLayoutPreset(presetName: string): P<boolean>;
	ExportLayoutPreset(presetName: string, presetFilePath: string): P<boolean>;
	DeleteLayoutPreset(presetName: string): P<boolean>;
	SaveLayoutPreset(presetName: string): P<boolean>;
	ImportLayoutPreset(presetFilePath: string, presetName?: string): P<boolean>;
	Quit(): P<void>;
	ImportRenderPreset(presetPath: string): P<boolean>;
	ExportRenderPreset(presetName: string, exportPath: string): P<boolean>;
	ImportBurnInPreset(presetPath: string): P<boolean>;
	ExportBurnInPreset(presetName: string, exportPath: string): P<boolean>;
	/** resolve.KEYFRAME_MODE_* */
	GetKeyframeMode(): P<number>;
	SetKeyframeMode(keyframeMode: number): P<boolean>;
}

export interface ProjectManager {
	ArchiveProject(
		projectName: string,
		filePath: string,
		isArchiveSrcMedia?: boolean,
		isArchiveRenderCache?: boolean,
		isArchiveProxyMedia?: boolean,
	): P<boolean>;
	/** Returns null if the name is not unique. */
	CreateProject(projectName: string): Maybe<Project>;
	DeleteProject(projectName: string): P<boolean>;
	LoadProject(projectName: string): Maybe<Project>;
	GetCurrentProject(): Maybe<Project>;
	SaveProject(): P<boolean>;
	CloseProject(project: Project): P<boolean>;
	CreateFolder(folderName: string): P<boolean>;
	DeleteFolder(folderName: string): P<boolean>;
	GetProjectListInCurrentFolder(): P<string[]>;
	GetFolderListInCurrentFolder(): P<string[]>;
	GotoRootFolder(): P<boolean>;
	GotoParentFolder(): P<boolean>;
	GetCurrentFolder(): P<string>;
	OpenFolder(folderName: string): P<boolean>;
	ImportProject(filePath: string, projectName?: string): P<boolean>;
	ExportProject(projectName: string, filePath: string, withStillsAndLUTs?: boolean): P<boolean>;
	RestoreProject(filePath: string, projectName?: string): P<boolean>;
	GetCurrentDatabase(): P<DatabaseInfo>;
	GetDatabaseList(): P<DatabaseInfo[]>;
	SetCurrentDatabase(dbInfo: DatabaseInfo): P<boolean>;
	CreateCloudProject(cloudSettings: CloudSettings): Maybe<Project>;
	LoadCloudProject(cloudSettings: CloudSettings): Maybe<Project>;
	ImportCloudProject(filePath: string, cloudSettings: CloudSettings): P<boolean>;
	RestoreCloudProject(folderPath: string, cloudSettings: CloudSettings): P<boolean>;
}

export interface Project {
	GetMediaPool(): Maybe<MediaPool>;
	GetTimelineCount(): P<number>;
	/** 1 <= idx <= GetTimelineCount() */
	GetTimelineByIndex(idx: number): Maybe<Timeline>;
	GetCurrentTimeline(): Maybe<Timeline>;
	SetCurrentTimeline(timeline: Timeline): P<boolean>;
	GetGallery(): Maybe<Gallery>;
	GetName(): P<string>;
	SetName(projectName: string): P<boolean>;
	GetPresetList(): P<Record<string, unknown>[]>;
	SetPreset(presetName: string): P<boolean>;
	/** Returns the new job id. */
	AddRenderJob(): P<string>;
	DeleteRenderJob(jobId: string): P<boolean>;
	DeleteAllRenderJobs(): P<boolean>;
	GetRenderJobList(): P<RenderJob[]>;
	GetRenderPresetList(): P<string[]>;
	StartRendering(...jobIds: string[]): P<boolean>;
	StartRendering(jobIds: string[], isInteractiveMode?: boolean): P<boolean>;
	StartRendering(isInteractiveMode?: boolean): P<boolean>;
	StopRendering(): P<void>;
	IsRenderingInProgress(): P<boolean>;
	LoadRenderPreset(presetName: string): P<boolean>;
	SaveAsNewRenderPreset(presetName: string): P<boolean>;
	DeleteRenderPreset(presetName: string): P<boolean>;
	SetRenderSettings(settings: RenderSettings): P<boolean>;
	GetRenderJobStatus(jobId: string): Maybe<RenderJobStatus>;
	GetQuickExportRenderPresets(): P<string[]>;
	/** Returns status info, or an error string. */
	RenderWithQuickExport(
		presetName: string,
		params?: QuickExportParams,
	): P<Record<string, unknown> | string>;
	GetSetting(): P<Record<string, string>>;
	GetSetting(settingName: string): P<string>;
	SetSetting(settingName: string, settingValue: string): P<boolean>;
	/** format -> file extension */
	GetRenderFormats(): P<Record<string, string>>;
	/** codec description -> codec name */
	GetRenderCodecs(renderFormat: string): P<Record<string, string>>;
	GetCurrentRenderFormatAndCodec(): P<{ format: string; codec: string }>;
	SetCurrentRenderFormatAndCodec(format: string, codec: string): P<boolean>;
	/** 0 - Individual clips, 1 - Single clip */
	GetCurrentRenderMode(): P<0 | 1>;
	SetCurrentRenderMode(renderMode: 0 | 1): P<boolean>;
	GetRenderResolutions(format?: string, codec?: string): P<Resolution[]>;
	RefreshLUTList(): P<boolean>;
	GetUniqueId(): P<string>;
	InsertAudioToCurrentTrackAtPlayhead(
		mediaPath: string,
		startOffsetInSamples: number,
		durationInSamples: number,
	): P<boolean>;
	LoadBurnInPreset(presetName: string): P<boolean>;
	ExportCurrentFrameAsStill(filePath: string): P<boolean>;
	GetColorGroupsList(): P<ColorGroup[]>;
	AddColorGroup(groupName: string): Maybe<ColorGroup>;
	DeleteColorGroup(colorGroup: ColorGroup): P<boolean>;
}

export interface MediaStorage {
	GetMountedVolumeList(): P<string[]>;
	GetSubFolderList(folderPath: string): P<string[]>;
	GetFileList(folderPath: string): P<string[]>;
	RevealInStorage(path: string): P<boolean>;
	AddItemListToMediaPool(...items: string[]): P<MediaPoolItem[]>;
	AddItemListToMediaPool(items: string[] | StorageItemInfo[]): P<MediaPoolItem[]>;
	AddClipMattesToMediaPool(
		item: MediaPoolItem,
		paths: string[],
		stereoEye?: "left" | "right",
	): P<boolean>;
	AddTimelineMattesToMediaPool(paths: string[]): P<MediaPoolItem[]>;
}

export interface MediaPool {
	GetRootFolder(): Maybe<Folder>;
	AddSubFolder(folder: Folder, name: string): Maybe<Folder>;
	RefreshFolders(): P<boolean>;
	CreateEmptyTimeline(name: string): Maybe<Timeline>;
	AppendToTimeline(...clips: MediaPoolItem[]): P<TimelineItem[]>;
	AppendToTimeline(clips: MediaPoolItem[] | AppendClipInfo[]): P<TimelineItem[]>;
	CreateTimelineFromClips(name: string, ...clips: MediaPoolItem[]): Maybe<Timeline>;
	CreateTimelineFromClips(
		name: string,
		clips: MediaPoolItem[] | Omit<AppendClipInfo, "mediaType" | "trackIndex">[],
	): Maybe<Timeline>;
	/** AAF/EDL/XML/FCPXML/DRT/ADL/OTIO */
	ImportTimelineFromFile(filePath: string, importOptions?: ImportTimelineOptions): Maybe<Timeline>;
	DeleteTimelines(timelines: Timeline[]): P<boolean>;
	GetCurrentFolder(): Maybe<Folder>;
	SetCurrentFolder(folder: Folder): P<boolean>;
	DeleteClips(clips: MediaPoolItem[]): P<boolean>;
	ImportFolderFromFile(filePath: string, sourceClipsPath?: string): P<boolean>;
	DeleteFolders(subfolders: Folder[]): P<boolean>;
	MoveClips(clips: MediaPoolItem[], targetFolder: Folder): P<boolean>;
	MoveFolders(folders: Folder[], targetFolder: Folder): P<boolean>;
	GetClipMatteList(item: MediaPoolItem): P<string[]>;
	GetTimelineMatteList(folder: Folder): P<MediaPoolItem[]>;
	DeleteClipMattes(item: MediaPoolItem, paths: string[]): P<boolean>;
	RelinkClips(items: MediaPoolItem[], folderPath: string): P<boolean>;
	UnlinkClips(items: MediaPoolItem[]): P<boolean>;
	ImportMedia(items: string[] | ImportClipInfo[]): P<MediaPoolItem[]>;
	/** All clips if none are given. */
	ExportMetadata(fileName: string, clips?: MediaPoolItem[]): P<boolean>;
	GetUniqueId(): P<string>;
	CreateStereoClip(left: MediaPoolItem, right: MediaPoolItem): Maybe<MediaPoolItem>;
	AutoSyncAudio(items: MediaPoolItem[], audioSyncSettings?: AudioSyncSettings): P<boolean>;
	GetSelectedClips(): P<MediaPoolItem[]>;
	SetSelectedClip(item: MediaPoolItem): P<boolean>;
}

export interface Folder {
	GetClipList(): P<MediaPoolItem[]>;
	GetName(): P<string>;
	GetSubFolderList(): P<Folder[]>;
	GetIsFolderStale(): P<boolean>;
	GetUniqueId(): P<string>;
	/** Exports as DRB. */
	Export(filePath: string): P<boolean>;
	TranscribeAudio(): P<boolean>;
	ClearTranscription(): P<boolean>;
}

/** Marker and flag methods shared by MediaPoolItem, Timeline and TimelineItem. */
interface Markable {
	AddMarker(
		frameId: number,
		color: MarkerColor,
		name: string,
		note: string,
		duration: number,
		customData?: string,
	): P<boolean>;
	GetMarkers(): P<Markers>;
	GetMarkerByCustomData(customData: string): P<MarkerInfo>;
	UpdateMarkerCustomData(frameId: number, customData: string): P<boolean>;
	GetMarkerCustomData(frameId: number): P<string>;
	/** "All" deletes all markers. */
	DeleteMarkersByColor(color: MarkerColor | "All"): P<boolean>;
	DeleteMarkerAtFrame(frameNum: number): P<boolean>;
	DeleteMarkerByCustomData(customData: string): P<boolean>;
}

interface Flaggable {
	AddFlag(color: string): P<boolean>;
	GetFlagList(): P<string[]>;
	/** "All" clears all flags. */
	ClearFlags(color: string): P<boolean>;
	GetClipColor(): P<string>;
	SetClipColor(colorName: string): P<boolean>;
	ClearClipColor(): P<boolean>;
}

export interface MediaPoolItem extends Markable, Flaggable {
	GetName(): P<string>;
	GetMetadata(): P<Record<string, string>>;
	GetMetadata(metadataType: string): P<string>;
	SetMetadata(metadataType: string, metadataValue: string): P<boolean>;
	SetMetadata(metadata: Record<string, string>): P<boolean>;
	GetThirdPartyMetadata(): P<Record<string, string>>;
	GetThirdPartyMetadata(metadataType: string): P<string>;
	SetThirdPartyMetadata(metadataType: string, metadataValue: string): P<boolean>;
	SetThirdPartyMetadata(metadata: Record<string, string>): P<boolean>;
	GetMediaId(): P<string>;
	GetClipProperty(): P<Record<string, string>>;
	GetClipProperty(propertyName: string): P<string>;
	SetClipProperty(propertyName: string, propertyValue: string | number): P<boolean>;
	LinkProxyMedia(proxyMediaFilePath: string): P<boolean>;
	LinkFullResolutionMedia(fullResMediaPath: string): P<boolean>;
	UnlinkProxyMedia(): P<boolean>;
	ReplaceClip(filePath: string): P<boolean>;
	ReplaceClipPreserveSubClip(filePath: string): P<boolean>;
	GetUniqueId(): P<string>;
	TranscribeAudio(): P<boolean>;
	ClearTranscription(): P<boolean>;
	/** JSON string, see "Audio Mapping". */
	GetAudioMapping(): P<string>;
	GetMarkInOut(): P<MarkInOut>;
	SetMarkInOut(markIn: number, markOut: number, type?: MarkType): P<boolean>;
	ClearMarkInOut(type?: MarkType): P<boolean>;
	MonitorGrowingFile(): P<boolean>;
}

export interface Timeline extends Markable {
	GetName(): P<string>;
	SetName(timelineName: string): P<boolean>;
	GetStartFrame(): P<number>;
	GetEndFrame(): P<number>;
	SetStartTimecode(timecode: string): P<boolean>;
	GetStartTimecode(): P<string>;
	GetTrackCount(trackType: TrackType): P<number>;
	AddTrack(
		trackType: TrackType,
		subTrackTypeOrOptions?: AudioSubTrackType | NewTrackOptions,
	): P<boolean>;
	DeleteTrack(trackType: TrackType, trackIndex: number): P<boolean>;
	/** Blank string for non-audio tracks. */
	GetTrackSubType(trackType: TrackType, trackIndex: number): P<AudioSubTrackType | "">;
	SetTrackEnable(trackType: TrackType, trackIndex: number, enabled: boolean): P<boolean>;
	GetIsTrackEnabled(trackType: TrackType, trackIndex: number): P<boolean>;
	SetTrackLock(trackType: TrackType, trackIndex: number, locked: boolean): P<boolean>;
	GetIsTrackLocked(trackType: TrackType, trackIndex: number): P<boolean>;
	DeleteClips(items: TimelineItem[], ripple?: boolean): P<boolean>;
	SetClipsLinked(items: TimelineItem[], linked: boolean): P<boolean>;
	GetItemListInTrack(trackType: TrackType, index: number): P<TimelineItem[]>;
	GetCurrentTimecode(): P<string>;
	SetCurrentTimecode(timecode: string): P<boolean>;
	GetCurrentVideoItem(): Maybe<TimelineItem>;
	GetCurrentClipThumbnailImage(): P<ThumbnailData>;
	GetTrackName(trackType: TrackType, trackIndex: number): P<string>;
	SetTrackName(trackType: TrackType, trackIndex: number, name: string): P<boolean>;
	DuplicateTimeline(timelineName?: string): Maybe<Timeline>;
	CreateCompoundClip(items: TimelineItem[], clipInfo?: CompoundClipInfo): Maybe<TimelineItem>;
	CreateFusionClip(items: TimelineItem[]): Maybe<TimelineItem>;
	/** AAF only. */
	ImportIntoTimeline(filePath: string, importOptions?: ImportIntoTimelineOptions): P<boolean>;
	/** exportType: resolve.EXPORT_*, exportSubtype required for AAF and EDL. */
	Export(fileName: string, exportType: number, exportSubtype?: number): P<boolean>;
	GetSetting(): P<Record<string, string>>;
	GetSetting(settingName: string): P<string>;
	SetSetting(settingName: string, settingValue: string): P<boolean>;
	InsertGeneratorIntoTimeline(generatorName: string): Maybe<TimelineItem>;
	InsertFusionGeneratorIntoTimeline(generatorName: string): Maybe<TimelineItem>;
	InsertFusionCompositionIntoTimeline(): Maybe<TimelineItem>;
	InsertOFXGeneratorIntoTimeline(generatorName: string): Maybe<TimelineItem>;
	InsertTitleIntoTimeline(titleName: string): Maybe<TimelineItem>;
	InsertFusionTitleIntoTimeline(titleName: string): Maybe<TimelineItem>;
	GrabStill(): Maybe<GalleryStill>;
	/** 1 - first frame, 2 - middle frame */
	GrabAllStills(stillFrameSource: 1 | 2): P<GalleryStill[]>;
	GetUniqueId(): P<string>;
	CreateSubtitlesFromAudio(autoCaptionSettings?: AutoCaptionSettings): P<boolean>;
	DetectSceneCuts(): P<boolean>;
	ConvertTimelineToStereo(): P<boolean>;
	GetNodeGraph(): Maybe<Graph>;
	/** Empty items analyses the whole timeline. analysisType: resolve.DLB_BLEND_SHOTS */
	AnalyzeDolbyVision(items?: TimelineItem[], analysisType?: number): P<boolean>;
	GetMediaPoolItem(): Maybe<MediaPoolItem>;
	GetMarkInOut(): P<MarkInOut>;
	SetMarkInOut(markIn: number, markOut: number, type?: MarkType): P<boolean>;
	ClearMarkInOut(type?: MarkType): P<boolean>;
}

export interface TimelineItem extends Markable, Flaggable {
	GetName(): P<string>;
	GetDuration(subframePrecision?: boolean): P<number>;
	GetEnd(subframePrecision?: boolean): P<number>;
	GetSourceEndFrame(): P<number>;
	GetSourceEndTime(): P<number>;
	GetFusionCompCount(): P<number>;
	GetFusionCompByIndex(compIndex: number): Maybe<FusionComp>;
	GetFusionCompNameList(): P<string[]>;
	GetFusionCompByName(compName: string): Maybe<FusionComp>;
	GetLeftOffset(subframePrecision?: boolean): P<number>;
	GetRightOffset(subframePrecision?: boolean): P<number>;
	GetStart(subframePrecision?: boolean): P<number>;
	GetSourceStartFrame(): P<number>;
	GetSourceStartTime(): P<number>;
	SetProperty<K extends keyof TimelineItemProperties>(
		propertyKey: K,
		propertyValue: TimelineItemProperties[K],
	): P<boolean>;
	SetProperty(properties: Partial<TimelineItemProperties>): P<boolean>;
	GetProperty(): P<TimelineItemProperties>;
	GetProperty<K extends keyof TimelineItemProperties>(propertyKey: K): P<TimelineItemProperties[K]>;
	AddFusionComp(): Maybe<FusionComp>;
	ImportFusionComp(path: string): Maybe<FusionComp>;
	ExportFusionComp(path: string, compIndex: number): P<boolean>;
	DeleteFusionCompByName(compName: string): P<boolean>;
	LoadFusionCompByName(compName: string): Maybe<FusionComp>;
	RenameFusionCompByName(oldName: string, newName: string): P<boolean>;
	AddVersion(versionName: string, versionType: VersionType): P<boolean>;
	GetCurrentVersion(): P<VersionInfo>;
	DeleteVersionByName(versionName: string, versionType: VersionType): P<boolean>;
	LoadVersionByName(versionName: string, versionType: VersionType): P<boolean>;
	RenameVersionByName(oldName: string, newName: string, versionType: VersionType): P<boolean>;
	GetVersionNameList(versionType: VersionType): P<string[]>;
	GetMediaPoolItem(): Maybe<MediaPoolItem>;
	/** offset -> convergence value */
	GetStereoConvergenceValues(): P<Record<number, number>>;
	GetStereoLeftFloatingWindowParams(): P<Record<number, Record<string, number>>>;
	GetStereoRightFloatingWindowParams(): P<Record<number, Record<string, number>>>;
	SetCDL(cdl: CDLMap): P<boolean>;
	AddTake(mediaPoolItem: MediaPoolItem, startFrame?: number, endFrame?: number): P<boolean>;
	/** 0 if not a take selector. */
	GetSelectedTakeIndex(): P<number>;
	GetTakesCount(): P<number>;
	GetTakeByIndex(idx: number): P<TakeInfo>;
	DeleteTakeByIndex(idx: number): P<boolean>;
	SelectTakeByIndex(idx: number): P<boolean>;
	FinalizeTake(): P<boolean>;
	CopyGrades(targetItems: TimelineItem[]): P<boolean>;
	SetClipEnabled(enabled: boolean): P<boolean>;
	GetClipEnabled(): P<boolean>;
	UpdateSidecar(): P<boolean>;
	GetUniqueId(): P<string>;
	LoadBurnInPreset(presetName: string): P<boolean>;
	/** "F" forward, "B" backward, "BI" bidirectional */
	CreateMagicMask(mode: "F" | "B" | "BI"): P<boolean>;
	RegenerateMagicMask(): P<boolean>;
	Stabilize(): P<boolean>;
	SmartReframe(): P<boolean>;
	GetNodeGraph(layerIdx?: number): Maybe<Graph>;
	GetColorGroup(): Maybe<ColorGroup>;
	AssignToColorGroup(colorGroup: ColorGroup): P<boolean>;
	RemoveFromColorGroup(): P<boolean>;
	/** exportType: resolve.EXPORT_LUT_* */
	ExportLUT(exportType: number, path: string): P<boolean>;
	GetLinkedItems(): P<TimelineItem[]>;
	GetTrackTypeAndIndex(): P<[TrackType, number]>;
	/** JSON string, see "Audio Mapping". */
	GetSourceAudioChannelMapping(): P<string>;
	/** resolve.CACHE_* */
	GetIsColorOutputCacheEnabled(): P<number>;
	GetIsFusionOutputCacheEnabled(): P<number>;
	SetColorOutputCache(cacheValue: number): P<boolean>;
	SetFusionOutputCache(cacheValue: number): P<boolean>;
}

export interface Gallery {
	GetAlbumName(album: GalleryStillAlbum): P<string>;
	SetAlbumName(album: GalleryStillAlbum, albumName: string): P<boolean>;
	GetCurrentStillAlbum(): Maybe<GalleryStillAlbum>;
	SetCurrentStillAlbum(album: GalleryStillAlbum): P<boolean>;
	GetGalleryStillAlbums(): P<GalleryStillAlbum[]>;
	GetGalleryPowerGradeAlbums(): P<GalleryStillAlbum[]>;
	CreateGalleryStillAlbum(): Maybe<GalleryStillAlbum>;
	CreateGalleryPowerGradeAlbum(): Maybe<GalleryStillAlbum>;
}

export type StillExportFormat =
	"dpx" | "cin" | "tif" | "jpg" | "png" | "ppm" | "bmp" | "xpm" | "drx";

export interface GalleryStillAlbum {
	GetStills(): P<GalleryStill[]>;
	GetLabel(still: GalleryStill): P<string>;
	SetLabel(still: GalleryStill, label: string): P<boolean>;
	ImportStills(filePaths: string[]): P<boolean>;
	ExportStills(
		stills: GalleryStill[],
		folderPath: string,
		filePrefix: string,
		format: StillExportFormat,
	): P<boolean>;
	DeleteStills(stills: GalleryStill[]): P<boolean>;
}

/** Opaque handle, no methods. */
export interface GalleryStill {
	readonly __brand?: "GalleryStill";
}

export interface Graph {
	GetNumNodes(): P<number>;
	SetLUT(nodeIndex: number, lutPath: string): P<boolean>;
	GetLUT(nodeIndex: number): P<string>;
	/** cacheValue: resolve.CACHE_* */
	SetNodeCacheMode(nodeIndex: number, cacheValue: number): P<boolean>;
	GetNodeCacheMode(nodeIndex: number): P<number>;
	GetNodeLabel(nodeIndex: number): P<string>;
	GetToolsInNode(nodeIndex: number): P<string[]>;
	SetNodeEnabled(nodeIndex: number, isEnabled: boolean): P<boolean>;
	/** 0 - no keyframes, 1 - source timecode aligned, 2 - start frames aligned */
	ApplyGradeFromDRX(path: string, gradeMode: 0 | 1 | 2): P<boolean>;
	ApplyArriCdlLut(): P<boolean>;
	ResetAllGrades(): P<boolean>;
}

export interface ColorGroup {
	GetName(): P<string>;
	SetName(groupName: string): P<boolean>;
	/** Defaults to the current timeline. */
	GetClipsInTimeline(timeline?: Timeline): P<TimelineItem[]>;
	GetPreClipNodeGraph(): Maybe<Graph>;
	GetPostClipNodeGraph(): Maybe<Graph>;
}

// ---------------------------------------------------------------------------
// Constants exposed as properties on the resolve object. The docs only give numeric values for
// some of them, so all are typed as number; read them off the resolve object at runtime.

export interface ResolveConstants {
	// Keyframe mode
	readonly KEYFRAME_MODE_ALL: number; // 0
	readonly KEYFRAME_MODE_COLOR: number; // 1
	readonly KEYFRAME_MODE_SIZING: number; // 2

	// Cache mode
	readonly CACHE_AUTO_ENABLED: number; // -1
	readonly CACHE_DISABLED: number; // 0
	readonly CACHE_ENABLED: number; // 1

	// Cloud project settings
	readonly CLOUD_SETTING_PROJECT_NAME: number;
	readonly CLOUD_SETTING_PROJECT_MEDIA_PATH: number;
	readonly CLOUD_SETTING_IS_COLLAB: number;
	readonly CLOUD_SETTING_SYNC_MODE: number;
	readonly CLOUD_SETTING_IS_CAMERA_ACCESS: number;
	readonly CLOUD_SYNC_NONE: number;
	readonly CLOUD_SYNC_PROXY_ONLY: number;
	readonly CLOUD_SYNC_PROXY_AND_ORIG: number;

	// "Cloud Sync" clip property
	readonly CLOUD_SYNC_DEFAULT: number; // -1
	readonly CLOUD_SYNC_DOWNLOAD_IN_QUEUE: number; // 0
	readonly CLOUD_SYNC_DOWNLOAD_IN_PROGRESS: number; // 1
	readonly CLOUD_SYNC_DOWNLOAD_SUCCESS: number; // 2
	readonly CLOUD_SYNC_DOWNLOAD_FAIL: number; // 3
	readonly CLOUD_SYNC_DOWNLOAD_NOT_FOUND: number; // 4
	readonly CLOUD_SYNC_UPLOAD_IN_QUEUE: number; // 5
	readonly CLOUD_SYNC_UPLOAD_IN_PROGRESS: number; // 6
	readonly CLOUD_SYNC_UPLOAD_SUCCESS: number; // 7
	readonly CLOUD_SYNC_UPLOAD_FAIL: number; // 8
	readonly CLOUD_SYNC_UPLOAD_NOT_FOUND: number; // 9
	readonly CLOUD_SYNC_SUCCESS: number; // 10

	// Audio sync
	readonly AUDIO_SYNC_MODE: number;
	readonly AUDIO_SYNC_CHANNEL_NUMBER: number;
	readonly AUDIO_SYNC_RETAIN_EMBEDDED_AUDIO: number;
	readonly AUDIO_SYNC_RETAIN_VIDEO_METADATA: number;
	readonly AUDIO_SYNC_WAVEFORM: number;
	readonly AUDIO_SYNC_TIMECODE: number;
	readonly AUDIO_SYNC_CHANNEL_AUTOMATIC: number; // -1
	readonly AUDIO_SYNC_CHANNEL_MIX: number; // -2

	// Auto caption settings
	readonly SUBTITLE_LANGUAGE: number;
	readonly SUBTITLE_CAPTION_PRESET: number;
	readonly SUBTITLE_CHARS_PER_LINE: number;
	readonly SUBTITLE_LINE_BREAK: number;
	readonly SUBTITLE_GAP: number;
	readonly AUTO_CAPTION_AUTO: number;
	readonly AUTO_CAPTION_DANISH: number;
	readonly AUTO_CAPTION_DUTCH: number;
	readonly AUTO_CAPTION_ENGLISH: number;
	readonly AUTO_CAPTION_FRENCH: number;
	readonly AUTO_CAPTION_GERMAN: number;
	readonly AUTO_CAPTION_ITALIAN: number;
	readonly AUTO_CAPTION_JAPANESE: number;
	readonly AUTO_CAPTION_KOREAN: number;
	readonly AUTO_CAPTION_MANDARIN_SIMPLIFIED: number;
	readonly AUTO_CAPTION_MANDARIN_TRADITIONAL: number;
	readonly AUTO_CAPTION_NORWEGIAN: number;
	readonly AUTO_CAPTION_PORTUGUESE: number;
	readonly AUTO_CAPTION_RUSSIAN: number;
	readonly AUTO_CAPTION_SPANISH: number;
	readonly AUTO_CAPTION_SWEDISH: number;
	readonly AUTO_CAPTION_SUBTITLE_DEFAULT: number;
	readonly AUTO_CAPTION_TELETEXT: number;
	readonly AUTO_CAPTION_NETFLIX: number;
	readonly AUTO_CAPTION_LINE_SINGLE: number;
	readonly AUTO_CAPTION_LINE_DOUBLE: number;

	// Timeline export types
	readonly EXPORT_AAF: number;
	readonly EXPORT_DRT: number;
	readonly EXPORT_EDL: number;
	readonly EXPORT_FCP_7_XML: number;
	readonly EXPORT_FCPXML_1_8: number;
	readonly EXPORT_FCPXML_1_9: number;
	readonly EXPORT_FCPXML_1_10: number;
	readonly EXPORT_HDR_10_PROFILE_A: number;
	readonly EXPORT_HDR_10_PROFILE_B: number;
	readonly EXPORT_TEXT_CSV: number;
	readonly EXPORT_TEXT_TAB: number;
	readonly EXPORT_DOLBY_VISION_VER_2_9: number;
	readonly EXPORT_DOLBY_VISION_VER_4_0: number;
	readonly EXPORT_DOLBY_VISION_VER_5_1: number;
	readonly EXPORT_OTIO: number;
	readonly EXPORT_ALE: number;
	readonly EXPORT_ALE_CDL: number;

	// Timeline export subtypes
	readonly EXPORT_NONE: number;
	readonly EXPORT_AAF_NEW: number;
	readonly EXPORT_AAF_EXISTING: number;
	readonly EXPORT_CDL: number;
	readonly EXPORT_SDL: number;
	readonly EXPORT_MISSING_CLIPS: number;

	// LUT export
	readonly EXPORT_LUT_17PTCUBE: number;
	readonly EXPORT_LUT_33PTCUBE: number;
	readonly EXPORT_LUT_65PTCUBE: number;
	readonly EXPORT_LUT_PANASONICVLUT: number;

	// Dolby Vision analysis
	readonly DLB_BLEND_SHOTS: number;

	// TimelineItem "DynamicZoomEase"
	readonly DYNAMIC_ZOOM_EASE_LINEAR: number; // 0
	readonly DYNAMIC_ZOOM_EASE_IN: number;
	readonly DYNAMIC_ZOOM_EASE_OUT: number;
	readonly DYNAMIC_ZOOM_EASE_IN_AND_OUT: number;

	// TimelineItem "CompositeMode"
	readonly COMPOSITE_NORMAL: number; // 0
	readonly COMPOSITE_ADD: number;
	readonly COMPOSITE_SUBTRACT: number;
	readonly COMPOSITE_DIFF: number;
	readonly COMPOSITE_MULTIPLY: number;
	readonly COMPOSITE_SCREEN: number;
	readonly COMPOSITE_OVERLAY: number;
	readonly COMPOSITE_HARDLIGHT: number;
	readonly COMPOSITE_SOFTLIGHT: number;
	readonly COMPOSITE_DARKEN: number;
	readonly COMPOSITE_LIGHTEN: number;
	readonly COMPOSITE_COLOR_DODGE: number;
	readonly COMPOSITE_COLOR_BURN: number;
	readonly COMPOSITE_EXCLUSION: number;
	readonly COMPOSITE_HUE: number;
	readonly COMPOSITE_SATURATE: number;
	readonly COMPOSITE_COLORIZE: number;
	readonly COMPOSITE_LUMA_MASK: number;
	readonly COMPOSITE_DIVIDE: number;
	readonly COMPOSITE_LINEAR_DODGE: number;
	readonly COMPOSITE_LINEAR_BURN: number;
	readonly COMPOSITE_LINEAR_LIGHT: number;
	readonly COMPOSITE_VIVID_LIGHT: number;
	readonly COMPOSITE_PIN_LIGHT: number;
	readonly COMPOSITE_HARD_MIX: number;
	readonly COMPOSITE_LIGHTER_COLOR: number;
	readonly COMPOSITE_DARKER_COLOR: number;
	readonly COMPOSITE_FOREGROUND: number;
	readonly COMPOSITE_ALPHA: number;
	readonly COMPOSITE_INVERTED_ALPHA: number;
	readonly COMPOSITE_LUM: number;
	readonly COMPOSITE_INVERTED_LUM: number;

	// TimelineItem "RetimeProcess"
	readonly RETIME_USE_PROJECT: number; // 0
	readonly RETIME_NEAREST: number;
	readonly RETIME_FRAME_BLEND: number;
	readonly RETIME_OPTICAL_FLOW: number;

	// TimelineItem "MotionEstimation"
	readonly MOTION_EST_USE_PROJECT: number; // 0
	readonly MOTION_EST_STANDARD_FASTER: number;
	readonly MOTION_EST_STANDARD_BETTER: number;
	readonly MOTION_EST_ENHANCED_FASTER: number;
	readonly MOTION_EST_ENHANCED_BETTER: number;
	readonly MOTION_EST_SPEED_WARP_BETTER: number;
	readonly MOTION_EST_SPEED_WARP_FASTER: number;

	// TimelineItem "Scaling"
	readonly SCALE_USE_PROJECT: number; // 0
	readonly SCALE_CROP: number;
	readonly SCALE_FIT: number;
	readonly SCALE_FILL: number;
	readonly SCALE_STRETCH: number;

	// TimelineItem "ResizeFilter"
	readonly RESIZE_FILTER_USE_PROJECT: number; // 0
	readonly RESIZE_FILTER_SHARPER: number;
	readonly RESIZE_FILTER_SMOOTHER: number;
	readonly RESIZE_FILTER_BICUBIC: number;
	readonly RESIZE_FILTER_BILINEAR: number;
	readonly RESIZE_FILTER_BESSEL: number;
	readonly RESIZE_FILTER_BOX: number;
	readonly RESIZE_FILTER_CATMULL_ROM: number;
	readonly RESIZE_FILTER_CUBIC: number;
	readonly RESIZE_FILTER_GAUSSIAN: number;
	readonly RESIZE_FILTER_LANCZOS: number;
	readonly RESIZE_FILTER_MITCHELL: number;
	readonly RESIZE_FILTER_NEAREST_NEIGHBOR: number;
	readonly RESIZE_FILTER_QUADRATIC: number;
	readonly RESIZE_FILTER_SINC: number;
	readonly RESIZE_FILTER_LINEAR: number;
}
