import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
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
