import { S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../env/index.ts";
export * from "./paths.ts";

export function createS3Client(env: S3Env): S3 {
	return new S3({
		endpoint: env.S3_ENDPOINT,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
		region: env.S3_REGION,
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
		},
		// The SDK's default CRC32 checksum gets baked into presigned PUT URLs (computed over an
		// empty body), so any real upload to the URL fails with SignatureDoesNotMatch.
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
}

export async function ensureBucket(client: S3, env: S3Env): Promise<void> {
	if (!(await client.headBucket({ Bucket: env.S3_BUCKET }).catch(() => false))) {
		await client.createBucket({ Bucket: env.S3_BUCKET });
	}
}

export async function ensureCORS(client: S3, env: S3Env, origin: string): Promise<void> {
	const corsConfig = {
		CORSRules: [
			{
				AllowedHeaders: ["*"],
				AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
				AllowedOrigins: [origin],
				MaxAgeSeconds: 3000,
			},
		],
	};

	// check if the CORS configuration is already set
	// direct comparison of objects may not work due to ordering, so we check the rules instead
	const currentCors = await client.getBucketCors({ Bucket: env.S3_BUCKET }).catch(() => null);
	if (
		currentCors &&
		currentCors.CORSRules &&
		currentCors.CORSRules.length === corsConfig.CORSRules.length &&
		currentCors.CORSRules.every((rule, index) => {
			const expectedRule = corsConfig.CORSRules[index];
			if (!expectedRule) return false;
			return (
				rule.AllowedHeaders?.join(",") === expectedRule.AllowedHeaders?.join(",") &&
				rule.AllowedMethods?.join(",") === expectedRule.AllowedMethods?.join(",") &&
				rule.AllowedOrigins?.join(",") === expectedRule.AllowedOrigins?.join(",") &&
				rule.MaxAgeSeconds === expectedRule.MaxAgeSeconds
			);
		})
	) {
		return;
	}

	await client.putBucketCors({ Bucket: env.S3_BUCKET, CORSConfiguration: corsConfig });
}
