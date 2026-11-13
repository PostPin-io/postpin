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
import {
	checkHlsSize,
	hlsDuration,
	isProxyRendition,
	PROXY_AUDIO,
	PROXY_VIDEO_CODEC,
	proxyCodecs,
} from "@postpin-io/shared/media/hls";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import * as v from "valibot";

/** A review proxy the plugin encoded with hlsArgs() and wants to upload */
export interface ProxyUploadRequest {
	/** a rendition from GET /v1/config, unchanged */
	width: number;
	height: number;
	bitRate: number;
	fileSize: number;
}

export interface ProxyUpload extends MultipartUpload {
	proxyId: string;
	width: number;
	height: number;
	bitRate: number;
}

export interface InitUploadResponse extends MultipartUpload {
	mediaId: string;
	/** one per requested proxy, same order */
	proxies?: ProxyUpload[];
}

export interface UploadedProxy {
	proxyId: string;
	uploadId: string;
	parts: UploadedPart[];
	/** byte ranges from the playlist ffmpeg wrote, see parseHlsPlaylist() */
	hls: {
		init: { offset: number; length: number };
		segments: { duration: number; offset: number; length: number }[];
	};
	hasAudio: boolean;
}

export interface CompleteUploadResponse {
	/** who encodes the review proxies: the plugin's were accepted, or the server encodes them */
	transcodedBy: "plugin" | "server";
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

/** As long as the presigned part URLs (presignPartUrls): longer and an abandoned upload blocks space */
const RESERVATION_MS = 24 * 60 * 60 * 1000;
const reservationEnd = () => new Date(Date.now() + RESERVATION_MS);

/**
 * Whether `fileSize` bytes may (still) be uploaded to this export: the size limit, which may have
 * been lowered meanwhile, and the quotas. The media's own reservation doesn't count against
 * itself. Whoever started the export pays for it, even if someone else continues the upload.
 */
async function assertUploadFits(a: {
	member: { organizationId: string; userId: string };
	uploadedById: string | null;
	fileSize: number;
	/** bytes beside the original, e.g. the plugin's proxies; not limited by the file size */
	extra?: number;
	mediaId?: string;
}) {
	assertFileSize(a.fileSize);
	try {
		await assertQuota({
			orgId: a.member.organizationId,
			userId: a.uploadedById ?? a.member.userId,
			additional: BigInt(a.fileSize + (a.extra ?? 0)),
			excludeMediaId: a.mediaId,
		});
	} catch (e) {
		if (e instanceof QuotaExceededError) error(413, e.message);
		throw e;
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
	/** the review proxies the plugin encoded; left out, the server encodes them */
	proxies?: ProxyUploadRequest[];
}): Promise<InitUploadResponse> {
	if (!Number.isInteger(a.fileSize) || a.fileSize <= 0) {
		error(400, "fileSize must be a positive integer");
	}
	const proxies = a.proxies ?? [];
	if (proxies.length > 0) validateProxyRequests(proxies);
	const { member } = await authorize("export", "upload", { type: "export", id: a.exportId });
	const exp = await findExport(a.exportId, a.path);

	if (exp.media && exp.media.status !== "PENDING") {
		error(409, "Export media was already uploaded");
	}
	await assertUploadFits({
		member,
		uploadedById: exp.uploadedById,
		fileSize: a.fileSize,
		extra: proxies.reduce((sum, p) => sum + p.fileSize, 0),
		// a retry replaces its own reservation
		mediaId: exp.media?.id,
	});

	let mediaId = exp.media?.id;
	if (!exp.media) {
		const { media } = await prisma.export.update({
			where: { id: a.exportId },
			data: {
				media: {
					create: {
						status: "PENDING",
						reservedUntil: reservationEnd(),
						// reserves the space until probe stores the real size
						original: { create: { size: BigInt(a.fileSize) } },
					},
				},
			},
			include: { media: true },
		});
		mediaId = media!.id;
	} else {
		// retry, possibly with a different file: a new reservation from now on
		await prisma.media.update({
			where: { id: exp.media.id },
			data: {
				reservedUntil: reservationEnd(),
				original: { update: { size: BigInt(a.fileSize) } },
			},
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
	const proxyUploads = await createProxyUploads(mediaId!, proxies);
	return {
		mediaId: mediaId!,
		...upload,
		...(proxyUploads.length > 0 ? { proxies: proxyUploads } : {}),
	};
}

/**
 * Proxies for an upload init-upload started without them: the plugin uploads the original while it
 * still encodes, then asks for the proxies' uploads once it knows their sizes. A second call
 * replaces the first one's proxies. Their space counts against the quotas like the original's.
 */
export async function initProxyUploads(a: {
	exportId: string;
	path?: ExportPath;
	proxies: ProxyUploadRequest[];
}): Promise<{ proxies: ProxyUpload[] }> {
	if (a.proxies.length === 0) error(422, "No proxies");
	validateProxyRequests(a.proxies);
	const { member } = await authorize("export", "upload", { type: "export", id: a.exportId });
	const exp = await findExport(a.exportId, a.path);
	const media = pendingMediaOf(exp);
	const fileSize = Number(media.original.size ?? 0);
	// abort-upload sets the reservation to 0: nothing to add proxies to
	if (fileSize <= 0) error(409, "The upload was cancelled");
	await assertUploadFits({
		member,
		uploadedById: exp.uploadedById,
		fileSize,
		extra: a.proxies.reduce((sum, p) => sum + p.fileSize, 0),
		// counts the original again instead, and the proxies of an earlier call not at all
		mediaId: media.id,
	});
	return { proxies: await createProxyUploads(media.id, a.proxies) };
}

/** The export's media while its upload is unfinished */
function pendingMediaOf(exp: Awaited<ReturnType<typeof findExport>>) {
	if (!exp.media) error(404, "Export not found");
	if (exp.media.status !== "PENDING") error(409, "Export media is already processing");
	return exp.media;
}

async function getPendingMedia(exportId: string, path?: ExportPath) {
	return pendingMediaOf(await findExport(exportId, path));
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
	/** every proxy init-upload returned, after its parts were PUT */
	proxies?: UploadedProxy[];
}): Promise<CompleteUploadResponse> {
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
	// parts changed in between. When S3 doesn't answer, the checked parts are trusted: deleting a
	// file that took hours to upload over a failed HEAD would be worse.
	const storedSize = await getObjectSize(s3Client, env, object).catch((e: unknown) => {
		console.error(`Measuring the original of ${media.id} failed`, e);
		return null;
	});
	if (storedSize !== null && storedSize !== fileSize) {
		await deleteObject(s3Client, env, object).catch((e: unknown) =>
			console.error(`Deleting the mismatched original of ${media.id} failed`, e),
		);
		await releaseReservation(media);
		if (storedSize > fileSize) {
			error(413, "The uploaded file is larger than announced, start the upload again");
		}
		error(409, "The uploaded file couldn't be verified, start the upload again");
	}

	// Assembling a large file takes a while, so a retry may arrive while the first complete is
	// still running, and S3 may answer both. Only one of them starts the processing.
	const claimed = await prisma.media.updateMany({
		where: { id: media.id, status: "PENDING" },
		data: { status: "PROCESSING" },
	});
	if (claimed.count === 0) error(409, "Export media is already processing");

	try {
		await prisma.export.update({
			where: { id: a.exportId },
			data: { timelineSnapshot: a.timelineSnapshot as unknown as Prisma.JsonObject },
		});
		// a proxy that doesn't check out never fails the upload: the server encodes instead
		const accepted = await completeProxies(media.id, a.proxies ?? []);
		await startMediaProcessing(media.id, { ...a.processing, transcode: !accepted });
		return { transcodedBy: accepted ? "plugin" : "server" };
	} catch (e) {
		// nothing was queued: back to an unfinished upload, which can be started again
		await prisma.media
			.update({ where: { id: media.id }, data: { status: "PENDING" } })
			.catch(() => {});
		throw e;
	}
}

/** Discards an unfinished multipart upload, so its parts don't linger in storage. */
export async function abortUpload(a: {
	exportId: string;
	path?: ExportPath;
	uploadId: string;
	proxies?: { proxyId: string; uploadId: string }[];
}): Promise<void> {
	await authorize("export", "upload", { type: "export", id: a.exportId });
	const media = await getPendingMedia(a.exportId, a.path);
	// the plugin gave up, so its proxies go too
	await dropProxies(media.id, a.proxies ?? []);
	// S3 not knowing the upload any more (aborted before, or by a lifecycle rule) is what we want
	await abortMultipartUpload(
		s3Client,
		env,
		{ mediaId: media.id, type: "original" },
		a.uploadId,
	).catch((e: unknown) => {
		if ((e as { name?: string })?.name !== "NoSuchUpload") throw e;
	});
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
	const { member } = await authorize("export", "upload", { type: "export", id: a.exportId });
	const exp = await findExport(a.exportId, a.path);
	const media = pendingMediaOf(exp);
	const fileSize = Number(media.original.size ?? 0);
	// abort-upload sets the reservation to 0: nothing to continue
	if (fileSize <= 0) error(409, "The upload was cancelled");

	const object = { mediaId: media.id, type: "original" } as const;
	const listed = await listUploadedParts(s3Client, env, object, a.uploadId).catch(() => null);
	if (!listed) error(409, "The upload can't be continued any more, start it again");

	// The reservation may have run out while the upload was paused, and the space may be taken
	// now; the new URLs are valid for another day, so the reservation has to be too
	await assertUploadFits({ member, uploadedById: exp.uploadedById, fileSize, mediaId: media.id });
	await prisma.media.update({
		where: { id: media.id },
		data: { reservedUntil: reservationEnd() },
	});

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

// ─── review proxies the plugin encoded ──────────────────────────────────────

function validateProxyRequests(proxies: ProxyUploadRequest[]) {
	if (env.TRANSCODE_MODE === "server") {
		error(422, "This server encodes the review proxies itself");
	}
	for (const proxy of proxies) {
		if (!isProxyRendition(proxy)) {
			error(422, `${proxy.width}x${proxy.height} is not a proxy rendition`);
		}
		if (!Number.isInteger(proxy.fileSize) || proxy.fileSize <= 0) {
			error(422, "Proxy fileSize must be a positive integer");
		}
	}
	if (new Set(proxies.map((proxy) => proxy.height)).size !== proxies.length) {
		error(422, "Every proxy rendition can only be uploaded once");
	}
}

/** A pending proxy row (it reserves the quota) and a multipart upload per proxy, same order */
async function createProxyUploads(mediaId: string, proxies: ProxyUploadRequest[]) {
	// a retry replaces the proxies of the previous attempt
	await prisma.mediaFile.deleteMany({ where: { proxyOfId: mediaId } });
	const uploads: ProxyUpload[] = [];
	for (const proxy of proxies) {
		const { id: proxyId } = await prisma.mediaFile.create({
			data: {
				proxyOfId: mediaId,
				status: "PENDING",
				contentType: "video/mp4",
				width: proxy.width,
				height: proxy.height,
				bitrate: proxy.bitRate,
				videoCodec: PROXY_VIDEO_CODEC,
				size: BigInt(proxy.fileSize),
			},
		});
		const upload = await createMultipartUpload(
			s3Client,
			env,
			{ mediaId, type: "proxy", proxyId },
			proxy.fileSize,
			s3PresignClient,
		);
		uploads.push({
			proxyId,
			width: proxy.width,
			height: proxy.height,
			bitRate: proxy.bitRate,
			...upload,
		});
	}
	return uploads;
}

/**
 * Completes and checks the proxies the plugin uploaded and marks them finished.
 * Returns false when there are none or one doesn't check out: then all of them are dropped and the
 * server encodes the proxies.
 */
async function completeProxies(mediaId: string, uploaded: UploadedProxy[]) {
	if (uploaded.length === 0) {
		await dropProxies(mediaId, []);
		return false;
	}
	try {
		if (env.TRANSCODE_MODE === "server") throw new Error("this server encodes proxies itself");
		const pending = await prisma.mediaFile.findMany({
			where: { proxyOfId: mediaId },
			select: { id: true, width: true, height: true },
		});
		const ids = new Set(uploaded.map((proxy) => proxy.proxyId));
		if (
			ids.size !== uploaded.length ||
			pending.length !== uploaded.length ||
			pending.some((proxy) => !ids.has(proxy.id))
		) {
			throw new Error("the proxies don't match the ones init-upload created");
		}

		const finished = [];
		for (const proxy of uploaded) {
			const object = { mediaId, type: "proxy", proxyId: proxy.proxyId } as const;
			await completeMultipartUpload(s3Client, env, object, proxy.uploadId, proxy.parts);
			const size = await getObjectSize(s3Client, env, object);
			if (size === null) throw new Error("S3 didn't report the proxy's size");
			const hls = v.parse(hlsInfo, proxy.hls);
			checkHlsSize(hls, size);
			const { width, height } = pending.find((row) => row.id === proxy.proxyId)!;
			finished.push({
				id: proxy.proxyId,
				box: { width: width!, height: height! },
				hls,
				size,
				hasAudio: proxy.hasAudio,
			});
		}
		await prisma.$transaction(
			finished.map(({ id, box, hls, size, hasAudio }) =>
				prisma.mediaFile.update({
					where: { id },
					data: {
						status: "COMPLETED",
						hls,
						codecs: proxyCodecs(hasAudio, box),
						size: BigInt(size),
						duration: hlsDuration(hls),
						audioCodec: hasAudio ? PROXY_AUDIO.codec : null,
					},
				}),
			),
		);
		return true;
	} catch (e) {
		console.warn(
			`[upload] media ${mediaId}: dropping the plugin's proxies, the server encodes:`,
			e,
		);
		await dropProxies(mediaId, uploaded);
		return false;
	}
}

/** Aborts the proxies' uploads and deletes them, with what was stored of them already */
async function dropProxies(mediaId: string, uploads: { proxyId: string; uploadId: string }[]) {
	const proxies = await prisma.mediaFile.findMany({
		where: { proxyOfId: mediaId },
		select: { id: true },
	});
	// Unfinished uploads the client didn't name, e.g. after it gave up on the proxies while the
	// original kept uploading: S3 lists them under the proxies' key prefix. Rows come before their
	// uploads (createProxyUploads), so without rows there's nothing to look for.
	const unnamed =
		proxies.length === 0
			? []
			: await s3Client
					.listMultipartUploads({ Bucket: env.S3_BUCKET, Prefix: `${mediaId}/proxy-` })
					.then((res) => res.Uploads ?? [])
					.catch(() => []);
	// best effort: whatever is left is unreachable without its database row
	await Promise.allSettled([
		...uploads.map(({ proxyId, uploadId }) =>
			abortMultipartUpload(s3Client, env, { mediaId, type: "proxy", proxyId }, uploadId),
		),
		...unnamed
			.filter((u) => u.Key && u.UploadId && !uploads.some((n) => n.uploadId === u.UploadId))
			.map((u) =>
				s3Client.abortMultipartUpload({ Bucket: env.S3_BUCKET, Key: u.Key, UploadId: u.UploadId }),
			),
		...proxies.map(({ id }) =>
			deleteObject(s3Client, env, { mediaId, type: "proxy", proxyId: id }),
		),
	]);
	await prisma.mediaFile.deleteMany({ where: { proxyOfId: mediaId } });
}
