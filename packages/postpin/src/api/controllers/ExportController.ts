import * as env from "$app/env/private";
import { prisma } from "#lib/server/database.ts";
import { startMediaProcessing } from "#lib/server/media.ts";
import { s3Client } from "#lib/server/storage.ts";
import {
	abortMultipartUpload,
	completeMultipartUpload,
	createMultipartUpload,
	type MultipartUpload,
	type UploadedPart,
} from "@postpin-io/shared/storage";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { Body, Controller, Get, Path, Post, Response, Route } from "tsoa";
import { HttpError } from "../HttpError.ts";
import type { Prisma } from "@postpin-io/shared/db";

interface InitUploadResponse extends MultipartUpload {
	mediaId: string;
}

@Route("v1/projects/{projectId}/timelines/{timelineId}/exports")
export class ExportController extends Controller {
	@Get("")
	public async getExports(
		@Path() projectId: string,
		@Path() timelineId: string,
	): Promise<{ exports: { id: string; createdAt: Date; name: string }[] }> {
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
		const timeline = await prisma.timeline.findFirst({
			where: { id: timelineId, projectId },
		});
		if (!timeline) {
			throw new HttpError(404, "Timeline not found");
		}

		return prisma.$transaction(async (tx) => {
			if (body.nleTimelineId !== timeline.nleTimelineId) {
				await tx.timeline.updateMany({
					where: { projectId, nleTimelineId: body.nleTimelineId },
					data: { nleTimelineId: null },
				});
				await tx.timeline.update({
					where: { id: timelineId },
					data: {
						nleTimelineId: body.nleTimelineId,
					},
				});
			}
			if (body.nleProjectId !== timeline.projectId) {
				await tx.project.updateMany({
					where: { id: projectId, nleProjectId: body.nleProjectId },
					data: { nleProjectId: null },
				});
				await prisma.project.update({
					where: { id: projectId },
					data: {
						nleProjectId: body.nleProjectId,
					},
				});
			}
			return tx.export.create({
				data: {
					timelineId,
					name: `Export ${new Date().toISOString()}`,
				},
				select: {
					id: true,
				},
			});
		});
	}

	/**
	 * Starts a multipart upload of the export's original file. PUT each part's bytes to its URL,
	 * keep the ETag response headers and pass them to complete-upload.
	 */
	@Post("{exportId}/init-upload")
	@Response(400, "Invalid file size")
	@Response(404, "Export not found")
	@Response(409, "Export media was already uploaded")
	public async initUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: { fileSize: number },
	): Promise<InitUploadResponse> {
		if (!Number.isInteger(body.fileSize) || body.fileSize <= 0) {
			throw new HttpError(400, "fileSize must be a positive integer");
		}

		const exp = await prisma.export.findFirst({
			where: { id: exportId, timelineId, timeline: { projectId } },
			include: { media: true },
		});
		if (!exp) {
			throw new HttpError(404, "Export not found");
		}

		let media = exp.media;
		if (!media) {
			({ media } = await prisma.export.update({
				where: { id: exportId },
				data: { media: { create: { status: "PENDING", original: { create: {} } } } },
				include: { media: true },
			}));
		} else if (media.status !== "PENDING") {
			throw new HttpError(409, "Export media was already uploaded");
		}

		const upload = await createMultipartUpload(
			s3Client,
			env,
			{ mediaId: media!.id, type: "original" },
			body.fileSize,
		);
		return { mediaId: media!.id, ...upload };
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
		const media = await this.getPendingMedia(projectId, timelineId, exportId);

		const uploaded = await completeMultipartUpload(
			s3Client,
			env,
			{ mediaId: media.id, type: "original" },
			body.uploadId,
			body.parts,
		)
			.then(() => true)
			.catch(() => false);
		if (!uploaded) {
			throw new HttpError(409, "Export file has not been fully uploaded");
		}

		await prisma.export.update({
			where: { id: exportId },
			data: { timelineSnapshot: body.timelineSnapshot as unknown as Prisma.JsonObject },
		});

		await startMediaProcessing(media.id);
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
		const media = await this.getPendingMedia(projectId, timelineId, exportId);
		await abortMultipartUpload(
			s3Client,
			env,
			{ mediaId: media.id, type: "original" },
			body.uploadId,
		);
	}

	private async getPendingMedia(projectId: string, timelineId: string, exportId: string) {
		const exp = await prisma.export.findFirst({
			where: { id: exportId, timelineId, timeline: { projectId } },
			include: { media: true },
		});
		if (!exp?.media) {
			throw new HttpError(404, "Export not found");
		}
		if (exp.media.status !== "PENDING") {
			throw new HttpError(409, "Export media is already processing");
		}
		return exp.media;
	}
}
