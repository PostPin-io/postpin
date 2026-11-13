import type { S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../env/index.ts";
import { getS3ObjectPath } from "./paths.ts";

/**
 * The generation in a shot thumbnail key: "<mediaId>/shotThumbnails-<generation>-<index>", or
 * null for the keys from before generations ("<mediaId>/shotThumbnails-<index>").
 */
export function shotThumbnailGeneration(key: string): string | null {
	const parts = key.slice(key.lastIndexOf("/") + 1).split("-");
	return parts.length === 3 ? parts[1]! : null;
}

/**
 * Deletes the shot thumbnails of a media whose generation `matches` (null: the keys without one).
 * Returns how many were deleted.
 */
export async function deleteShotThumbnails(
	s3Client: S3,
	env: S3Env,
	mediaId: string,
	matches: (generation: string | null) => boolean,
): Promise<number> {
	const prefix = `${getS3ObjectPath({ mediaId, type: "shotThumbnails" })}-`;
	let deleted = 0;
	let ContinuationToken: string | undefined;
	do {
		const res = await s3Client.listObjectsV2({
			Bucket: env.S3_BUCKET,
			Prefix: prefix,
			ContinuationToken,
		});
		const keys = (res.Contents ?? [])
			.map((o) => o.Key)
			.filter((key): key is string => !!key && matches(shotThumbnailGeneration(key)));
		// DeleteObjects takes at most 1000 keys, which is also the page size of a listing
		if (keys.length > 0) {
			await s3Client.deleteObjects({
				Bucket: env.S3_BUCKET,
				Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
			});
			deleted += keys.length;
		}
		ContinuationToken = res.NextContinuationToken;
	} while (ContinuationToken);
	return deleted;
}
