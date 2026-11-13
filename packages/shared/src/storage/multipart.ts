import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	ListPartsCommand,
	UploadPartCommand,
	type S3,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Env } from "../env/index.ts";
import { getS3ObjectPath, type S3Object } from "./paths.ts";

const MiB = 1024 * 1024;
// S3 requires every part except the last to be at least 5 MiB, and allows at most 10000 parts.
const MIN_PART_SIZE = 32 * MiB;
const MAX_PART_COUNT = 10000;

export interface MultipartUploadPartUrl {
	partNumber: number;
	/** Presigned S3 PUT URL for this part, valid for one day. */
	url: string;
}

export interface MultipartUpload {
	uploadId: string;
	/** Size of every part except the last one, in bytes. */
	partSize: number;
	parts: MultipartUploadPartUrl[];
}

export interface UploadedPart {
	partNumber: number;
	/** ETag response header of the part's PUT request */
	etag: string;
}

/** How a file of `fileSize` bytes is split into parts. The same size always gives the same split. */
export function partLayout(fileSize: number): { partSize: number; partCount: number } {
	const partSize = Math.max(MIN_PART_SIZE, Math.ceil(fileSize / MAX_PART_COUNT / MiB) * MiB);
	return { partSize, partCount: Math.max(1, Math.ceil(fileSize / partSize)) };
}

/** The size part `partNumber` (1-based) must have in a file of `fileSize` bytes */
export function expectedPartSize(partNumber: number, fileSize: number): number {
	const { partSize, partCount } = partLayout(fileSize);
	return partNumber < partCount ? partSize : fileSize - partSize * (partCount - 1);
}

export type PartsCheck =
	| { ok: true }
	/** A part is bigger than the layout allows: the file is larger than what was reserved */
	| { ok: false; reason: "too-large"; message: string }
	/** Missing, duplicate, unknown or too small parts, or ETags S3 doesn't know */
	| { ok: false; reason: "incomplete"; message: string };

const unquote = (etag: string) => etag.replace(/^"|"$/g, "");

/**
 * Whether the parts a client wants to complete are exactly the file of `fileSize` bytes that was
 * reserved: every part of partLayout(fileSize) once, as S3 has it (same ETag), each of its
 * expected size. The presigned part URLs don't limit the body size, so S3's word counts, not
 * the client's.
 */
export function checkUploadedParts(
	listed: (UploadedPart & { size: number })[],
	claimed: UploadedPart[],
	fileSize: number,
): PartsCheck {
	const { partCount } = partLayout(fileSize);
	const byNumber = new Map(listed.map((p) => [p.partNumber, p]));
	const numbers = new Set(claimed.map((p) => p.partNumber));
	if (numbers.size !== claimed.length) {
		return { ok: false, reason: "incomplete", message: "A part was sent twice" };
	}

	let total = 0;
	for (const part of claimed) {
		if (part.partNumber < 1 || part.partNumber > partCount) {
			return {
				ok: false,
				reason: "incomplete",
				message: `Part ${part.partNumber} doesn't belong to the file`,
			};
		}
		const stored = byNumber.get(part.partNumber);
		if (!stored || unquote(stored.etag) !== unquote(part.etag)) {
			return {
				ok: false,
				reason: "incomplete",
				message: `Part ${part.partNumber} has not been uploaded`,
			};
		}
		const expected = expectedPartSize(part.partNumber, fileSize);
		if (stored.size > expected) {
			return {
				ok: false,
				reason: "too-large",
				message: "The uploaded file is larger than announced",
			};
		}
		if (stored.size < expected) {
			return { ok: false, reason: "incomplete", message: `Part ${part.partNumber} is incomplete` };
		}
		total += stored.size;
	}
	if (numbers.size !== partCount || total !== fileSize) {
		return { ok: false, reason: "incomplete", message: "Export file has not been fully uploaded" };
	}
	return { ok: true };
}

/** Presigned PUT URLs for the given part numbers, valid for one day */
export function presignPartUrls(
	presignClient: S3,
	env: S3Env,
	object: S3Object,
	uploadId: string,
	partNumbers: number[],
): Promise<MultipartUploadPartUrl[]> {
	const key = getS3ObjectPath(object);
	return Promise.all(
		partNumbers.map(async (partNumber) => ({
			partNumber,
			url: await getSignedUrl(
				presignClient,
				new UploadPartCommand({
					Bucket: env.S3_BUCKET,
					Key: key,
					UploadId: uploadId,
					PartNumber: partNumber,
				}),
				// Large renders over slow connections take a while
				{ expiresIn: 24 * 60 * 60 },
			),
		})),
	);
}

export async function createMultipartUpload(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	fileSize: number,
	/** Signs the part URLs; pass the public presign client when they leave the server. */
	presignClient: S3 = s3Client,
): Promise<MultipartUpload> {
	const key = getS3ObjectPath(object);
	const { UploadId } = await s3Client.send(
		new CreateMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: key }),
	);
	if (!UploadId) throw new Error("S3 did not return an upload id");

	const { partSize, partCount } = partLayout(fileSize);
	const parts = await presignPartUrls(
		presignClient,
		env,
		object,
		UploadId,
		Array.from({ length: partCount }, (_, i) => i + 1),
	);

	return { uploadId: UploadId, partSize, parts };
}

export async function completeMultipartUpload(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	uploadId: string,
	parts: UploadedPart[],
): Promise<void> {
	await s3Client.send(
		new CompleteMultipartUploadCommand({
			Bucket: env.S3_BUCKET,
			Key: getS3ObjectPath(object),
			UploadId: uploadId,
			MultipartUpload: {
				Parts: [...parts]
					.sort((a, b) => a.partNumber - b.partNumber)
					.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })),
			},
		}),
	);
}

export async function abortMultipartUpload(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	uploadId: string,
): Promise<void> {
	await s3Client.send(
		new AbortMultipartUploadCommand({
			Bucket: env.S3_BUCKET,
			Key: getS3ObjectPath(object),
			UploadId: uploadId,
		}),
	);
}

/** Parts S3 already has for an unfinished upload, with their ETags. Throws if the upload is gone. */
export async function listUploadedParts(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	uploadId: string,
): Promise<(UploadedPart & { size: number })[]> {
	const parts: (UploadedPart & { size: number })[] = [];
	let marker: string | undefined;
	do {
		const res = await s3Client.send(
			new ListPartsCommand({
				Bucket: env.S3_BUCKET,
				Key: getS3ObjectPath(object),
				UploadId: uploadId,
				PartNumberMarker: marker,
			}),
		);
		for (const p of res.Parts ?? []) {
			if (p.PartNumber && p.ETag) {
				parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size ?? 0 });
			}
		}
		marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
	} while (marker);
	return parts.sort((a, b) => a.partNumber - b.partNumber);
}

/** Size of a stored object in bytes, null if S3 doesn't say */
export async function getObjectSize(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
): Promise<number | null> {
	const res = await s3Client.send(
		new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: getS3ObjectPath(object) }),
	);
	return res.ContentLength ?? null;
}

export async function deleteObject(s3Client: S3, env: S3Env, object: S3Object): Promise<void> {
	await s3Client.send(
		new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: getS3ObjectPath(object) }),
	);
}
