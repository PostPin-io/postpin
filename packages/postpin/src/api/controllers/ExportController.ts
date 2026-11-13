import { prisma } from "#lib/server/database.ts";
import {
	abortUpload,
	completeUpload,
	createExport,
	initProxyUploads,
	initUpload,
	type CompleteUploadResponse,
	type InitUploadResponse,
	type ProxyUpload,
	type ProxyUploadRequest,
	type UploadedProxy,
} from "#lib/server/export-upload.ts";
import type { UploadedPart } from "@postpin-io/shared/storage";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { Body, Controller, Get, Path, Post, Response, Route, Security } from "@tsoa/runtime";
import { HttpError } from "../HttpError.ts";
import { apiAuthorize, apiCall } from "../access.ts";

@Security("session")
@Route("v1/projects/{projectId}/timelines/{timelineId}/exports")
export class ExportController extends Controller {
	@Get("")
	public async getExports(
		@Path() projectId: string,
		@Path() timelineId: string,
	): Promise<{ exports: { id: string; createdAt: Date; name: string }[] }> {
		await apiAuthorize("timeline", "read", { type: "timeline", id: timelineId });

		const timeline = await prisma.timeline.findFirst({
			where: { id: timelineId, projectId },
			select: {
				exports: {
					select: { id: true, createdAt: true, name: true },
					orderBy: { createdAt: "desc" },
				},
			},
		});
		if (!timeline) {
			throw new HttpError(404, "Timeline not found");
		}
		return { exports: timeline.exports };
	}

	@Post("")
	@Response(404, "Export not found")
	public async createExport(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Body() body: { nleTimelineId: string | null; nleProjectId: string | null },
	): Promise<{ id: string }> {
		return apiCall(createExport({ projectId, timelineId, nle: body }));
	}

	/**
	 * Starts a multipart upload of the export's original file. PUT each part's bytes to its URL,
	 * keep the ETag response headers and pass them to complete-upload.
	 */
	@Post("{exportId}/init-upload")
	@Response(400, "Invalid file size")
	@Response(404, "Export not found")
	@Response(409, "Export media was already uploaded")
	@Response(413, "File too large or storage quota exceeded")
	@Response(422, "Invalid proxies, or the server transcodes itself")
	public async initUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		/**
		 * `proxies`: the review proxies the plugin encoded, when GET /v1/config says `plugin`.
		 * Left out, the server encodes them.
		 */
		@Body() body: { fileSize: number; proxies?: ProxyUploadRequest[] },
	): Promise<InitUploadResponse> {
		return apiCall(
			initUpload({
				exportId,
				path: { projectId, timelineId },
				fileSize: body.fileSize,
				proxies: body.proxies,
			}),
		);
	}

	/**
	 * Uploads for the review proxies the plugin encoded, after init-upload started the original
	 * without them: the plugin uploads the original while it still encodes. One per proxy, in
	 * request order; a second call replaces the first one's. Then pass them to complete-upload.
	 */
	@Post("{exportId}/init-proxy-uploads")
	@Response(404, "Export not found")
	@Response(409, "Media already processing or upload cancelled")
	@Response(413, "Storage quota exceeded")
	@Response(422, "Invalid proxies, or the server transcodes itself")
	public async initProxyUploads(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { proxies: ProxyUploadRequest[] },
	): Promise<{ proxies: ProxyUpload[] }> {
		return apiCall(
			initProxyUploads({ exportId, path: { projectId, timelineId }, proxies: body.proxies }),
		);
	}

	/**
	 * Call after all parts were PUT: assembles the original (and the proxies) in storage, stores the
	 * timeline snapshot and queues probing, thumbnailing and, without usable proxies, transcoding.
	 * Proxies that don't check out are dropped and the server encodes instead.
	 */
	@Post("{exportId}/complete-upload")
	@Response(404, "Export not found")
	@Response(409, "Upload missing or media already processing")
	public async completeUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body()
		body: {
			uploadId: string;
			parts: UploadedPart[];
			timelineSnapshot: TimelineSnapshot;
			/** every proxy init-upload returned, after its parts were PUT */
			proxies?: UploadedProxy[];
		},
	): Promise<CompleteUploadResponse> {
		return apiCall(completeUpload({ exportId, path: { projectId, timelineId }, ...body }));
	}

	/** Discards an unfinished multipart upload, so its parts don't linger in storage. */
	@Post("{exportId}/abort-upload")
	@Response(404, "Export not found")
	@Response(409, "Media already processing")
	public async abortUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { uploadId: string; proxies?: { proxyId: string; uploadId: string }[] },
	): Promise<void> {
		await apiCall(
			abortUpload({
				exportId,
				path: { projectId, timelineId },
				uploadId: body.uploadId,
				proxies: body.proxies,
			}),
		);
	}
}
