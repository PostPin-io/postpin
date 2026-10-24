import {
	abortUpload,
	completeUpload,
	createExport,
	initUpload,
	type TimelineSnapshot,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";

import type { HostBridge, NleBridge, RenderProgress, UploadProgress } from "./bridge";

export interface RenderAndUploadOptions {
	nle: NleBridge;
	host: HostBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	// human readable progress, one line per step
	onStep?: (message: string) => void;
	onRenderProgress?: (progress: RenderProgress) => void;
	onUploadProgress?: (progress: UploadProgress) => void;
}

function formatMegabytes(bytes: number) {
	return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

// Renders the current timeline in the NLE, creates an export for it and uploads the render
// with a snapshot of the timeline. Returns the id of the new export.
export async function renderAndUpload({
	nle,
	host,
	client,
	projectId,
	timelineId,
	onStep = () => {},
	onRenderProgress = () => {},
	onUploadProgress = () => {},
}: RenderAndUploadOptions) {
	const [nleProjectId, nleTimelineId] = await Promise.all([
		nle.getProjectId(),
		nle.getTimelineId(),
	]);

	onStep("Rendering preview...");
	const renderedPath = await nle.renderPreview(onRenderProgress);
	const timelineSnapshot = (await nle.buildTimelineSnapshot()) as TimelineSnapshot;

	onStep("Render complete. Creating export...");
	const { data: createdExport } = await createExport({
		client,
		path: { projectId, timelineId },
		body: { nleProjectId, nleTimelineId },
		throwOnError: true,
	});
	const exportId = createdExport.id;

	onStep(`Export created with ID: ${exportId}. Initializing upload...`);
	const fileSize = await host.getFileSize(renderedPath);
	const { data: upload } = await initUpload({
		client,
		path: { projectId, timelineId, exportId },
		body: { fileSize },
		throwOnError: true,
	});

	try {
		onStep(`Uploading ${formatMegabytes(fileSize)} in ${upload.parts.length} parts...`);
		const parts = await host.uploadFile(
			renderedPath,
			upload.partSize,
			upload.parts,
			onUploadProgress,
		);

		onStep("Upload complete. Starting processing...");
		await completeUpload({
			client,
			path: { projectId, timelineId, exportId },
			body: { uploadId: upload.uploadId, parts, timelineSnapshot },
			throwOnError: true,
		});
	} catch (err) {
		// Discard the uploaded parts, the export stays without media
		await abortUpload({
			client,
			path: { projectId, timelineId, exportId },
			body: { uploadId: upload.uploadId },
		}).catch(() => {});
		throw err;
	}

	return { exportId };
}
