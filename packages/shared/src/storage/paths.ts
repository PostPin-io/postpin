import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Env } from "../env/index.ts";

export interface S3Object {
	videoId: string;
	type: "thumbnail" | "original" | "transcoded";
	transcodeId?: string;
}

export function getS3ObjectPath({ videoId, type, transcodeId }: S3Object) {
	return `${videoId}/${type}${transcodeId ? `-${transcodeId}` : ""}`;
}

export function getPresignedUrl(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	method: "get" | "put" = "get",
) {
	const key = getS3ObjectPath(object);
	return getSignedUrl(
		s3Client,
		method === "get"
			? new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
			: new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
		{
			expiresIn: 60 * 60,
		},
	);
}
