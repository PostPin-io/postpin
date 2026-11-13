import { prisma } from "#lib/server/database.ts";
import {
	abortUpload,
	completeUpload,
	createExport,
	initUpload,
	type InitUploadResponse,
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
	public async initUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { fileSize: number },
	): Promise<InitUploadResponse> {
		return apiCall(
			initUpload({ exportId, path: { projectId, timelineId }, fileSize: body.fileSize }),
		);
	}

	/**
	 * Call after all parts were PUT: assembles the original in storage, stores the timeline
	 * snapshot and queues transcoding, probing and thumbnailing.
	 */
	@Post("{exportId}/complete-upload")
	@Response(404, "Export not found")
	@Response(409, "Upload missing or media already processing")
	public async completeUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { uploadId: string; parts: UploadedPart[]; timelineSnapshot: TimelineSnapshot },
	): Promise<void> {
		await apiCall(completeUpload({ exportId, path: { projectId, timelineId }, ...body }));
	}

	/** Discards an unfinished multipart upload, so its parts don't linger in storage. */
	@Post("{exportId}/abort-upload")
	@Response(404, "Export not found")
	@Response(409, "Media already processing")
	public async abortUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { uploadId: string },
	): Promise<void> {
		await apiCall(
			abortUpload({ exportId, path: { projectId, timelineId }, uploadId: body.uploadId }),
		);
	}
}
