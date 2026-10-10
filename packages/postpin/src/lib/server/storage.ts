import { building } from "$app/env";
import * as minio from "minio";
import {
	S3_ACCESS_KEY,
	S3_BUCKET,
	S3_HOST,
	S3_PORT,
	S3_USE_SSL,
	S3_REGION,
	S3_SECRET_KEY,
} from "$app/env/private";

const s3Client = building
	? (null as unknown as minio.Client)
	: new minio.Client({
			endPoint: S3_HOST,
			port: S3_PORT,
			useSSL: S3_USE_SSL,
			accessKey: S3_ACCESS_KEY,
			secretKey: S3_SECRET_KEY,
		});

if (!building) {
	if (!(await s3Client.bucketExists(S3_BUCKET))) {
		await s3Client.makeBucket(S3_BUCKET, S3_REGION);
	}
}

export { s3Client };
