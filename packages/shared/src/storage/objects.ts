import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../env/index.ts";
import { getS3ObjectPath, type S3Object } from "./paths.ts";

/** Stores a small text file in one request, e.g. a cut list; large files go through multipart */
export async function putTextObject(
	s3Client: S3,
	env: S3Env,
	object: S3Object,
	text: string,
	contentType = "text/plain; charset=utf-8",
): Promise<string> {
	const key = getS3ObjectPath(object);
	await s3Client.send(
		new PutObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: key,
			Body: text,
			ContentType: contentType,
		}),
	);
	return key;
}

/** The content of a text object, see putTextObject */
export async function getTextObject(s3Client: S3, env: S3Env, key: string): Promise<string> {
	const res = await s3Client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
	if (!res.Body) throw new Error(`S3 returned no body for ${key}`);
	return await res.Body.transformToString("utf-8");
}
