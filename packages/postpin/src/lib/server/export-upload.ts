// Uploading an export's original file, shared by the plugin API (ExportController) and the web
// upload (upload.remote.ts). Errors are SvelteKit errors; the controller turns them into HttpErrors.
import * as env from "$app/env/private";
import { error } from "@sveltejs/kit";
import { prisma } from "#lib/server/database.ts";
import { startMediaProcessing } from "#lib/server/media.ts";
import { authorize } from "#lib/server/org-access.ts";
import { s3Client, s3PresignClient } from "#lib/server/storage.ts";
import {
	assertQuota,
	getOrgUsage,
	getUserUsage,
	orgQuota,
	QuotaExceededError,
	userQuota,
} from "#lib/server/storage-usage.ts";
import type { Prisma } from "@postpin-io/shared/db";
import { formatByteSize } from "@postpin-io/shared/logic/bytes";
import {
	abortMultipartUpload,
	checkUploadedParts,
	completeMultipartUpload,
	createMultipartUpload,
	deleteObject,
	expectedPartSize,
	getObjectSize,
	listUploadedParts,
	partLayout,
	presignPartUrls,
	type MultipartUpload,
	type MultipartUploadPartUrl,
	type UploadedPart,
} from "@postpin-io/shared/storage";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

export interface InitUploadResponse extends MultipartUpload {
	mediaId: string;
}

/**
 * Project and timeline the caller addressed the export by (the plugin API's path). When given,
 * they must match the export, otherwise it is "not found". The web addresses exports by id only.
 */
export type ExportPath = { projectId: string; timelineId: string };

/** null = no limit besides the quotas */
export const maxUploadFileSize = (): bigint | null => env.UPLOAD_MAX_FILE_SIZE ?? null;

export function assertFileSize(fileSize: number) {
	if (!Number.isInteger(fileSize) || fileSize <= 0) {
		error(400, "fileSize must be a positive integer");
	}
	const max = maxUploadFileSize();
	if (max !== null && BigInt(fileSize) > max) {
		error(
			413,
			`The file is too large: ${formatByteSize(fileSize)}, at most ${formatByteSize(max)}`,
		);
	}
}

/**
 * A new, empty export in the timeline. `nle` links the timeline and project to the editing
 * software's ids (plugins), moving the ids away from other timelines/projects of the org.
 */
export async function createExport(a: {
	projectId: string;
	timelineId: string;
	name?: string;
	nle?: { nleTimelineId: string | null; nleProjectId: string | null };
}): Promise<{ id: string }> {
	const { projectId, timelineId, nle } = a;
	const { member } = await authorize("export", "upload", { type: "timeline", id: timelineId });
	const timeline = await prisma.timeline.findFirst({
		where: { id: timelineId, projectId },
		include: { project: { select: { nleProjectId: true } } },
	});
	if (!timeline) error(404, "Timeline not found");

	return prisma.$transaction(async (tx) => {
		if (nle && nle.nleTimelineId !== timeline.nleTimelineId) {
			if (nle.nleTimelineId) {
				await tx.timeline.updateMany({
					where: {
						id: { not: timelineId },
						nleTimelineId: nle.nleTimelineId,
						project: { organizationId: member.organizationId },
					},
					data: { nleTimelineId: null },
				});
			}
			await tx.timeline.update({
				where: { id: timelineId },
				data: { nleTimelineId: nle.nleTimelineId },
			});
		}
		if (nle && nle.nleProjectId !== timeline.project.nleProjectId) {
			if (nle.nleProjectId) {
				await tx.project.updateMany({
					where: {
						id: { not: projectId },
						nleProjectId: nle.nleProjectId,
						organizationId: member.organizationId,
					},
					data: { nleProjectId: null },
				});
			}
			await tx.project.update({
				where: { id: projectId },
				data: { nleProjectId: nle.nleProjectId },
			});
		}
		return tx.export.create({
			data: {
				timelineId,
				uploadedById: member.userId,
				name: a.name ?? `Export ${new Date().toISOString()}`,
			},
			select: { id: true },
		});
	});
}

/** The export, if the path (when given) matches it */
async function findExport(exportId: string, path?: ExportPath) {
	const exp = await prisma.export.findFirst({
		where: {
			id: exportId,
			...(path && { timelineId: path.timelineId, timeline: { projectId: path.projectId } }),
		},
		include: { media: { include: { original: { select: { size: true } } } } },
	});
	if (!exp) error(404, "Export not found");
	return exp;
}

/**
 * Starts a multipart upload of the export's original file. PUT each part's bytes to its URL,
 * keep the ETag response headers and pass them to completeUpload. Reserves `fileSize` bytes of
 * the quotas until the worker measured the file.
 */
export async function initUpload(a: {
	exportId: string;
	path?: ExportPath;
	fileSize: number;
}): Promise<InitUploadResponse> {
	if (!Number.isInteger(a.fileSize) || a.fileSize <= 0) {
		error(400, "fileSize must be a positive integer");
	}
	const { member } = await authorize("export", "upload", { type: "export", id: a.exportId });
	const exp = await findExport(a.exportId, a.path);

	if (exp.media && exp.media.status !== "PENDING") {
		error(409, "Export media was already uploaded");
	}
	assertFileSize(a.fileSize);

	try {
		await assertQuota({
			orgId: member.organizationId,
			// whoever started the export pays for it, even if someone else retries the upload
			userId: exp.uploadedById ?? member.userId,
			additional: BigInt(a.fileSize),
			// a retry replaces its own reservation
			excludeMediaId: exp.media?.id,
		});
	} catch (e) {
		if (e instanceof QuotaExceededError) error(413, e.message);
		throw e;
	}

	let mediaId = exp.media?.id;
	if (!exp.media) {
		const { media } = await prisma.export.update({
			where: { id: a.exportId },
			data: {
				media: {
					create: {
						status: "PENDING",
						// reserves the space until probe stores the real size
						original: { create: { size: BigInt(a.fileSize) } },
					},
				},
			},
			include: { media: true },
		});
		mediaId = media!.id;
	} else {
		// retry, possibly with a different file
		await prisma.mediaFile.update({
			where: { id: exp.media.originalId },
			data: { size: BigInt(a.fileSize) },
		});
	}

	const upload = await createMultipartUpload(
		s3Client,
		env,
		{ mediaId: mediaId!, type: "original" },
		a.fileSize,
		// the plugin or browser PUTs the parts, so they're signed for the public endpoint
		s3PresignClient,
	);
	return { mediaId: mediaId!, ...upload };
}

/** The export's media while its upload is unfinished */
async function getPendingMedia(exportId: string, path?: ExportPath) {
	const exp = await findExport(exportId, path);
	if (!exp.media) error(404, "Export not found");
	if (exp.media.status !== "PENDING") error(409, "Export media is already processing");
	return exp.media;
}

/**
 * Gives the reservation back after an upload had to be thrown away; the export stays PENDING,
 * so the upload can be started again (resume-upload answers "cancelled").
 */
async function releaseReservation(media: { originalId: string }) {
	await prisma.mediaFile.update({ where: { id: media.originalId }, data: { size: 0n } });
}

/**
 * Call after all parts were PUT: assembles the original in storage, stores the timeline
 * snapshot and queues transcoding, probing and thumbnailing (and the cut detection if asked).
 *
 * The size limit and the quotas were checked against the size init-upload was given, but a
 * presigned part URL accepts a body of any size. So the parts S3 has must be exactly that file,
 * and the assembled object is measured once more before anything is processed.
 */
export async function completeUpload(a: {
	exportId: string;
	path?: ExportPath;
	uploadId: string;
	parts: UploadedPart[];
	timelineSnapshot: TimelineSnapshot;
	/** Web uploads: their snapshot is an estimate the worker improves, see startMediaProcessing */
	processing?: { webUpload: boolean; detectCuts: boolean };
}): Promise<void> {
	await authorize("export", "upload", { type: "export", id: a.exportId });
	const media = await getPendingMedia(a.exportId, a.path);
	const fileSize = Number(media.original.size ?? 0);
	// abort-upload sets the reservation to 0: nothing to complete
	if (fileSize <= 0) error(409, "The upload was cancelled");
	const object = { mediaId: media.id, type: "original" } as const;

	const listed = await listUploadedParts(s3Client, env, object, a.uploadId).catch(() => null);
	if (!listed) error(409, "Export file has not been fully uploaded");
	const check = checkUploadedParts(listed, a.parts, fileSize);
	if (!check.ok) {
		if (check.reason === "too-large") {
			// the oversized parts take up space no quota accounts for: drop them right away
			await abortMultipartUpload(s3Client, env, object, a.uploadId).catch((e: unknown) =>
				console.error(`Aborting the oversized upload of ${media.id} failed`, e),
			);
			await releaseReservation(media);
			error(413, check.message);
		}
		// a missing or short part can still be uploaded, see resumeUpload
		error(409, check.message);
	}

	const uploaded = await completeMultipartUpload(s3Client, env, object, a.uploadId, a.parts)
		.then(() => true)
		.catch(() => false);
	if (!uploaded) error(409, "Export file has not been fully uploaded");

	// Second line of defence: S3 assembled exactly the checked parts, so this only differs if the
	// parts changed in between. Unknown counts as wrong; the upload is gone either way by now.
	const storedSize = await getObjectSize(s3Client, env, object).catch(() => null);
	if (storedSize !== fileSize) {
		await deleteObject(s3Client, env, object).catch((e: unknown) =>
			console.error(`Deleting the mismatched original of ${media.id} failed`, e),
		);
		await releaseReservation(media);
		if (storedSize !== null && storedSize > fileSize) {
			error(413, "The uploaded file is larger than announced, start the upload again");
		}
		error(409, "The uploaded file couldn't be verified, start the upload again");
	}

	await prisma.export.update({
		where: { id: a.exportId },
		data: { timelineSnapshot: a.timelineSnapshot as unknown as Prisma.JsonObject },
	});

	await startMediaProcessing(media.id, a.processing);
}

/** Discards an unfinished multipart upload, so its parts don't linger in storage. */
export async function abortUpload(a: {
	exportId: string;
	path?: ExportPath;
	uploadId: string;
}): Promise<void> {
	await authorize("export", "upload", { type: "export", id: a.exportId });
	const media = await getPendingMedia(a.exportId, a.path);
	await abortMultipartUpload(s3Client, env, { mediaId: media.id, type: "original" }, a.uploadId);
	// frees the reserved space
	await releaseReservation(media);
}

export interface ResumeUploadResponse {
	partSize: number;
	/** Parts S3 already has; send their ETags to completeUpload together with the new ones */
	uploaded: UploadedPart[];
	/** Fresh URLs for the parts still missing */
	parts: MultipartUploadPartUrl[];
}

/**
 * Picks an interrupted upload up again: which parts S3 already has, and new URLs for the rest
 * (the old ones may have expired). The file must be the one init-upload was started with.
 */
export async function resumeUpload(a: {
	exportId: string;
	path?: ExportPath;
	uploadId: string;
}): Promise<ResumeUploadResponse> {
	await authorize("export", "upload", { type: "export", id: a.exportId });
	const media = await getPendingMedia(a.exportId, a.path);
	const fileSize = Number(media.original.size ?? 0);
	// abort-upload sets the reservation to 0: nothing to continue
	if (fileSize <= 0) error(409, "The upload was cancelled");

	const object = { mediaId: media.id, type: "original" } as const;
	const listed = await listUploadedParts(s3Client, env, object, a.uploadId).catch(() => null);
	if (!listed) error(409, "The upload can't be continued any more, start it again");

	const { partSize, partCount } = partLayout(fileSize);
	// a part of the wrong size (another file?) is uploaded again
	const uploaded = listed
		.filter((p) => p.partNumber <= partCount && p.size === expectedPartSize(p.partNumber, fileSize))
		.map(({ partNumber, etag }) => ({ partNumber, etag }));
	const have = new Set(uploaded.map((p) => p.partNumber));
	const missing = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !have.has(n));

	const parts = await presignPartUrls(s3PresignClient, env, object, a.uploadId, missing);
	return { partSize, uploaded, parts };
}

/** What a member may still upload to the timeline's org: the file size limit and the free quota */
export async function uploadLimits(member: { organizationId: string; userId: string }) {
	const [org, user, orgUsed, userUsed] = await Promise.all([
		prisma.organization.findUniqueOrThrow({
			where: { id: member.organizationId },
			select: { storageQuota: true },
		}),
		prisma.user.findUniqueOrThrow({ where: { id: member.userId }, select: { storageQuota: true } }),
		getOrgUsage(member.organizationId),
		getUserUsage(member.userId),
	]);
	const free = (used: bigint, quota: bigint | null) =>
		quota === null ? null : quota > used ? quota - used : 0n;
	const orgFree = free(orgUsed, orgQuota(org.storageQuota));
	const userFree = free(userUsed, userQuota(user.storageQuota));
	const available =
		orgFree === null
			? userFree
			: userFree === null
				? orgFree
				: orgFree < userFree
					? orgFree
					: userFree;
	return { maxFileSize: maxUploadFileSize(), available };
}
