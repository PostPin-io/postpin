import { building } from "$app/env";
import * as env from "$app/env/private";
import { createS3Client, ensureBucket, ensureCORS } from "@postpin/shared/storage";
import { S3 } from "@aws-sdk/client-s3";

const s3Client = building ? (null as unknown as S3) : createS3Client(env);

if (!building) {
	await ensureBucket(s3Client, env);
	await ensureCORS(s3Client, env, env.BETTER_AUTH_URL);
}

export { s3Client };
