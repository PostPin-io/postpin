import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Env } from "../env/index.ts";

export interface S3Object {
	mediaId: string;
	type: "thumbnail" | "original" | "proxy" | "sprite" | "shotThumbnails";
	proxyId?: string;
	index?: number;
}

export function getS3ObjectPath({ mediaId, type, proxyId, index }: S3Object) {
	return `${mediaId}/${type}${proxyId ? `-${proxyId}` : ""}${index !== undefined ? `-${index}` : ""}`;
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
