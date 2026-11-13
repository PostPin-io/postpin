import {
	abortUpload,
	completeUpload,
	createExport,
	getConfig,
	initProxyUploads,
	initUpload,
	type TimelineSnapshot,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";
import { displaySize, selectRenditions, type Rendition } from "@postpin-io/shared/media/hls";

import type {
	EncodedProxy,
	HostBridge,
	NleBridge,
	RenderProgress,
	UploadedPart,
	UploadProgress,
} from "./bridge";
import { errorMessage } from "./errors";

export interface RenderAndUploadOptions {
	nle: NleBridge;
	host: HostBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	// human readable progress, one line per step
	onStep?: (message: string) => void;
	onRenderProgress?: (progress: RenderProgress) => void;
	/** encoding the review versions, 0 to 1 */
	onTranscodeProgress?: (fraction: number) => void;
	/**
	 * over all files: the render and, once encoded, the review versions. The total grows when they
	 * join, the render starts uploading while they are still encoded.
	 */
	onUploadProgress?: (progress: UploadProgress) => void;
}

function formatMegabytes(bytes: number) {
	return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

interface Encoded {
	proxies: (EncodedProxy & { rendition: Rendition })[];
	hasAudio: boolean;
}

/**
 * Encodes the review proxies on this machine when the server wants that and the host can.
 * Returns null otherwise or when encoding fails: then the server encodes them.
 */
async function encodeProxies(
	host: HostBridge,
	renderedPath: string,
	renditions: Rendition[],
	onStep: (message: string) => void,
	onProgress: (fraction: number) => void,
): Promise<Encoded | null> {
	if (!host.probe || !host.transcode) return null;
	try {
		const probe = await host.probe(renderedPath);
		const selected = selectRenditions(displaySize(probe), renditions);
		onStep(`Encoding review versions (${selected.map((r) => `${r.height}p`).join(", ")})...`);
		const results = await host.transcode(renderedPath, selected, probe.hasAudio, onProgress);
		if (results.length !== selected.length) {
			throw new Error(`expected ${selected.length} review versions, got ${results.length}`);
		}
		return {
			proxies: results.map((result, i) => ({ ...result, rendition: selected[i]! })),
			hasAudio: probe.hasAudio,
		};
	} catch (err) {
		onStep(`Encoding failed, PostPin encodes the review versions instead: ${errorMessage(err)}`);
		return null;
	}
}

// Renders the current timeline in the NLE, creates an export and uploads the render with a snapshot
// of the timeline. Meanwhile it encodes the review versions if the server wants that, and uploads
// them next to the render. Returns the export's id.
export async function renderAndUpload({
	nle,
	host,
	client,
	projectId,
	timelineId,
	onStep = () => {},
	onRenderProgress = () => {},
	onTranscodeProgress = () => {},
	onUploadProgress = () => {},
}: RenderAndUploadOptions) {
	// the config first: a server with another API version answers 426 before a long render
	const [nleProjectId, nleTimelineInfo, { data: config }] = await Promise.all([
		nle.getProjectId(),
		nle.getTimelineInfo(),
		getConfig({ client, throwOnError: true }),
	]);

	if (!nleTimelineInfo) {
		throw new Error("No timeline found");
	}

	onStep("Rendering preview...");
	const timelineSnapshot = await nle.buildTimelineSnapshot();
	if (!timelineSnapshot) {
		throw new Error("Failed to build timeline snapshot");
	}
	const renderedPath = await nle.renderPreview(onRenderProgress);

	onStep("Render complete. Creating export...");
	const { data: createdExport } = await createExport({
		client,
		path: { projectId, timelineId },
		body: { nleProjectId, nleTimelineId: nleTimelineInfo.id },
		throwOnError: true,
	});
	const exportId = createdExport.id;
	const path = { projectId, timelineId, exportId };

	onStep(`Export created with ID: ${exportId}. Initializing upload...`);
	const fileSize = await host.getFileSize(renderedPath);
	const { data: upload } = await initUpload({
		client,
		path,
		body: { fileSize },
		throwOnError: true,
	});

	// one progress over every file known so far
	const progress = new Map<string, { uploaded: number; total: number }>();
	const uploadOne = (
		key: string,
		filePath: string,
		bytes: number,
		target: { partSize: number; parts: typeof upload.parts },
	): Promise<UploadedPart[]> => {
		const report = (uploaded: number) => {
			progress.set(key, { uploaded, total: bytes });
			let uploadedBytes = 0;
			let totalBytes = 0;
			for (const file of progress.values()) {
				uploadedBytes += file.uploaded;
				totalBytes += file.total;
			}
			onUploadProgress({ uploadedBytes, totalBytes });
		};
		progress.set(key, { uploaded: 0, total: bytes });
		return host.uploadFile(filePath, target.partSize, target.parts, (p) => report(p.uploadedBytes));
	};

	let encoded: Encoded | null = null;
	let proxyTargets: { proxyId: string; uploadId: string }[] = [];
	// set when the render's upload failed: the review versions stop where they are
	let aborted = false;

	/**
	 * Encodes the review versions while the render uploads, then uploads them next to it. Never
	 * throws: anything that fails leaves them out and the server encodes instead.
	 */
	const uploadReviewVersions = async () => {
		if (config.transcode.mode !== "plugin") return null;
		encoded = await encodeProxies(
			host,
			renderedPath,
			config.transcode.renditions,
			onStep,
			onTranscodeProgress,
		);
		if (!encoded || aborted) return null;
		const { proxies, hasAudio } = encoded;
		try {
			const { data } = await initProxyUploads({
				client,
				path,
				body: {
					proxies: proxies.map(({ rendition, bytes }) => ({ ...rendition, fileSize: bytes })),
				},
				throwOnError: true,
			});
			proxyTargets = data.proxies;
			onStep(`Uploading ${proxies.length} review versions...`);
			const uploaded = [];
			for (const [i, target] of data.proxies.entries()) {
				if (aborted) return null;
				const parts = await uploadOne(`proxy-${i}`, proxies[i]!.path, proxies[i]!.bytes, target);
				uploaded.push({
					proxyId: target.proxyId,
					uploadId: target.uploadId,
					parts,
					hls: proxies[i]!.hls,
					hasAudio,
				});
			}
			return uploaded;
		} catch (err) {
			// complete-upload without them drops what was uploaded of them already
			onStep(
				`Uploading the review versions failed, PostPin encodes them instead: ${errorMessage(err)}`,
			);
			return null;
		}
	};
	const removeReviewVersions = () =>
		Promise.all(
			(encoded?.proxies ?? []).map((proxy) => host.removeFile?.(proxy.path).catch(() => {})),
		);

	const reviewVersions = uploadReviewVersions();
	try {
		onStep(`Uploading ${formatMegabytes(fileSize)} in ${upload.parts.length} parts...`);
		const [parts, uploadedProxies] = await Promise.all([
			uploadOne("render", renderedPath, fileSize, upload),
			reviewVersions,
		]);

		onStep("Upload complete. Starting processing...");
		const { data: completed } = await completeUpload({
			client,
			path,
			body: {
				uploadId: upload.uploadId,
				parts,
				timelineSnapshot,
				...(uploadedProxies && { proxies: uploadedProxies }),
			},
			throwOnError: true,
		});
		if (uploadedProxies && completed?.transcodedBy === "server") {
			onStep("PostPin couldn't use the review versions and encodes them itself.");
		}
	} catch (err) {
		aborted = true;
		// Discard the uploaded parts, the export stays without media
		await abortUpload({
			client,
			path,
			body: {
				uploadId: upload.uploadId,
				...(proxyTargets.length > 0 && {
					proxies: proxyTargets.map(({ proxyId, uploadId }) => ({ proxyId, uploadId })),
				}),
			},
		}).catch(() => {});
		// the encoding may still run: clean up once it's done, without making the caller wait
		void reviewVersions.then(removeReviewVersions);
		throw err;
	}
	// the review versions are only needed for the upload
	await removeReviewVersions();
	return { exportId };
}
