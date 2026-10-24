import type { RenderProgress } from "@postpin-io/plugin-core/bridge";
import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	BitDepth,
	CompressionType,
	EMFileDestination,
	EMFileType,
	EMSourceType,
	EMVideoExportOptions,
	ExportFormat,
	TimelineLocationType,
	TripleBool,
	type EMSourceInfo,
} from "../../third-party/protools-sdk/dist/PTSL";
import { send, sendWithProgress } from "./ptsl";
import type { SessionTiming } from "./session";
import { getSelectionFrames } from "./time";

// TODO: let users pick the source, e.g. through the renderPresets capability
export async function getMixSource(): Promise<EMSourceInfo> {
	const { sourceList } = await send("GetExportMixSourceList", {
		type: EMSourceType.EMSType_Output,
	});
	const name = sourceList[0];
	if (!name) throw new Error("The Pro Tools session has no output to bounce");
	return { sourceType: EMSourceType.EMSType_Output, name };
}

let rendering = false;

// Bounces the edit selection with the video track into a MOV and returns the file path
export async function renderPreview(
	timing: SessionTiming,
	onProgress: (progress: RenderProgress) => void,
): Promise<string> {
	if (rendering) throw new Error("Pro Tools is already rendering");
	rendering = true;
	try {
		const [source, { startFrame, endFrame }, { sampleRate }] = await Promise.all([
			getMixSource(),
			getSelectionFrames(timing),
			send("GetSessionSampleRate"),
		]);
		const directory = os.tmpdir();
		const fileName = `postpin-preview-${Date.now()}`;
		const timecode = (frame: number) => ({
			location: formatTimecode(frame, timing.frameRate),
			timeType: TimelineLocationType.TLType_TimeCode,
		});

		onProgress({ percent: 0, estimatedTimeRemainingMs: 0 });
		await sendWithProgress(
			"ExportMix",
			{
				fileName,
				fileType: EMFileType.EMFType_MOV,
				mixSourceList: [source],
				audioInfo: {
					compressionType: CompressionType.CType_PCM,
					exportFormat: ExportFormat.EFormat_Interleaved,
					bitDepth: BitDepth.BDepth_24,
					sampleRate,
					padToFrameBoundary: TripleBool.TBool_True,
				},
				videoInfo: {
					includeVideo: TripleBool.TBool_True,
					exportOption: EMVideoExportOptions.EMVEOptions_SameAsSource,
					codecInfo: { codecName: "SameAsSource", propertyList: [] },
				},
				locationInfo: {
					importAfterBounce: TripleBool.TBool_False,
					fileDestination: EMFileDestination.EMFDestination_Directory,
					directory: directory + path.sep,
				},
				offlineBounce: TripleBool.TBool_True,
				startTime: timecode(startFrame),
				endTime: timecode(endFrame),
			},
			(percent) => onProgress({ percent, estimatedTimeRemainingMs: 0 }),
		);

		// we dont know the extension, find the file
		const file = (await readdir(directory)).find((entry) => entry.startsWith(fileName));
		if (!file) throw new Error(`Pro Tools didn't write ${fileName} to ${directory}`);
		return path.join(directory, file);
	} finally {
		rendering = false;
	}
}
