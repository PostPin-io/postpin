import { building } from "$app/env";
import * as env from "$app/env/private";
import {
	createS3Client,
	createS3PresignClient,
	ensureBucket,
	ensureCORS,
} from "@postpin-io/shared/storage";
import { S3 } from "@aws-sdk/client-s3";

/** For S3 operations from the server (internal endpoint). */
const s3Client = building ? (null as unknown as S3) : createS3Client(env);
/** For presigned URLs handed to browsers and plugins (public endpoint). */
const s3PresignClient = building ? (null as unknown as S3) : createS3PresignClient(env);

if (!building) {
	await ensureBucket(s3Client, env);
	await ensureCORS(s3Client, env, env.BETTER_AUTH_URL);
}

export { s3Client, s3PresignClient };
