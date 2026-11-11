import type { S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../env/index.ts";
import type { S3Object } from "./paths.ts";

export interface MediaImageSizes {
	thumbnailSize: bigint;
	seekSpritesSize: bigint;
	shotThumbnailsSize: bigint;
}

/** Media columns for each image type in the bucket, see getS3ObjectPath() for the keys */
const COLUMNS: Partial<Record<S3Object["type"], keyof MediaImageSizes>> = {
	thumbnail: "thumbnailSize",
	sprite: "seekSpritesSize",
	shotThumbnails: "shotThumbnailsSize",
};

/**
 * Sums the generated images of a media from a listing of its folder. Originals and proxies are
 * left out: their sizes are already on their MediaFile rows.
 */
export async function measureMediaImages(
	s3Client: S3,
	env: S3Env,
	mediaId: string,
): Promise<MediaImageSizes> {
	const sizes: MediaImageSizes = { thumbnailSize: 0n, seekSpritesSize: 0n, shotThumbnailsSize: 0n };
	const prefix = `${mediaId}/`;
	let ContinuationToken: string | undefined;
	do {
		const res = await s3Client.listObjectsV2({
			Bucket: env.S3_BUCKET,
			Prefix: prefix,
			ContinuationToken,
		});
		for (const { Key, Size } of res.Contents ?? []) {
			// "<mediaId>/<type>[-<proxyId>][-<index>]"
			const type = Key?.slice(prefix.length).split("-")[0] as S3Object["type"] | undefined;
			const column = type && COLUMNS[type];
			if (column) sizes[column] += BigInt(Size ?? 0);
		}
		ContinuationToken = res.NextContinuationToken;
	} while (ContinuationToken);
	return sizes;
}
