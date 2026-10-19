import * as env from "$app/env/private";
import { prisma } from "#lib/server/database.ts";
import { startMediaProcessing } from "#lib/server/media.ts";
import { s3Client } from "#lib/server/storage.ts";
import { getPresignedUrl, getS3ObjectPath } from "@postpin-io/shared/storage";
import { Controller, Path, Post, Response, Route } from "tsoa";

interface UploadUrlResponse {
	mediaId: string;
	/** Presigned S3 PUT URL for the export's original file, valid for one hour. */
	uploadUrl: string;
}

@Route("v1/projects/{projectId}/timelines/{timelineId}/exports")
export class ExportController extends Controller {
	@Post("")
	@Response(404, "Export not found")
	public async createExport(
		@Path() projectId: string,
		@Path() timelineId: string,
	): Promise<{ id: string }> {
		const timeline = await prisma.timeline.findFirst({
			where: { id: timelineId, projectId },
		});
		if (!timeline) {
			this.setStatus(404);
			throw new Error("Timeline not found");
		}

		return await prisma.export.create({
			data: {
				timelineId,
				name: `Export ${new Date().toISOString()}`,
			},
			select: {
				id: true,
			},
		});
	}

	@Post("{exportId}/init-upload")
	@Response(404, "Export not found")
	@Response(409, "Export media was already uploaded")
	public async initUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<UploadUrlResponse> {
		const exp = await prisma.export.findFirst({
			where: { id: exportId, timelineId, timeline: { projectId } },
			include: { media: true },
		});
		if (!exp) {
			this.setStatus(404);
			throw new Error("Export not found");
		}

		let media = exp.media;
		if (!media) {
			({ media } = await prisma.export.update({
				where: { id: exportId },
				data: { media: { create: { status: "PENDING", original: { create: {} } } } },
				include: { media: true },
			}));
		} else if (media.status !== "PENDING") {
			this.setStatus(409);
			throw new Error("Export media was already uploaded");
		}

		const uploadUrl = await getPresignedUrl(
			s3Client,
			env,
			{ mediaId: media!.id, type: "original" },
			"put",
		);
		return { mediaId: media!.id, uploadUrl };
	}

	/**
	 * Call after the file was PUT to the upload URL: checks the original exists in storage and
	 * queues transcoding, probing and thumbnailing.
	 */
	@Post("{exportId}/complete-upload")
	@Response(404, "Export not found")
	@Response(409, "Upload missing or media already processing")
	public async completeUpload(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<void> {
		const exp = await prisma.export.findFirst({
			where: { id: exportId, timelineId, timeline: { projectId } },
			include: { media: true },
		});
		if (!exp?.media) {
			this.setStatus(404);
			throw new Error("Export not found");
		}
		if (exp.media.status !== "PENDING") {
			this.setStatus(409);
			throw new Error("Export media is already processing");
		}

		const uploaded = await s3Client
			.headObject({
				Bucket: env.S3_BUCKET,
				Key: getS3ObjectPath({ mediaId: exp.media.id, type: "original" }),
			})
			.then(() => true)
			.catch(() => false);
		if (!uploaded) {
			this.setStatus(409);
			throw new Error("Export file has not been uploaded");
		}

		await startMediaProcessing(exp.media.id);
	}
}
