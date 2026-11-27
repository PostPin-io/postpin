import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Env } from "../env/index.ts";

export interface S3Object {
	mediaId: string;
	type: "thumbnail" | "original" | "proxy" | "sprite" | "shotThumbnails" | "cutList";
	proxyId?: string;
	index?: number;
	/** Shot thumbnails: the render they belong to, see ShotThumbnails */
	generation?: string;
	/**
	 * Shot thumbnails: the large version of the image. A suffix on the index, not another "-" part,
	 * so the generation stays the second part of the key (see shotThumbnailGeneration).
	 */
	large?: boolean;
}

export function getS3ObjectPath({ mediaId, type, proxyId, index, generation, large }: S3Object) {
	return `${mediaId}/${type}${proxyId ? `-${proxyId}` : ""}${generation ? `-${generation}` : ""}${index !== undefined ? `-${index}` : ""}${large ? "_large" : ""}`;
}

export function getPresignedUrl(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	method: "get" | "put" = "get",
	expiresIn: number = 60 * 60,
) {
	const key = getS3ObjectPath(object);
	return getSignedUrl(
		s3Client,
		method === "get"
			? new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
			: new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
		{
			expiresIn,
		},
	);
}
