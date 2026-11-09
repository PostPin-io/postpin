import { describe, expect, it } from "vitest";
import { createS3Client, createS3PresignClient, getPresignedUrl } from "../../src/storage/index.ts";
import type { S3Env } from "../../src/env/index.ts";

// Real signing, no mocks: getSignedUrl only computes the signature and never connects to S3.

const env: S3Env = {
	S3_ENDPOINT: "http://rustfs:9000",
	S3_PUBLIC_ENDPOINT: "https://media.example.com",
	S3_FORCE_PATH_STYLE: true,
	S3_ACCESS_KEY: "key",
	S3_SECRET_KEY: "secret",
	S3_BUCKET: "bucket",
	S3_REGION: "eu-central-1",
};
const object = { mediaId: "m", type: "original" } as const;

async function signedUrl(client: ReturnType<typeof createS3Client>) {
	return new URL(await getPresignedUrl(client, env, object));
}

describe("createS3PresignClient", () => {
	it("signs URLs for the public endpoint", async () => {
		const url = await signedUrl(createS3PresignClient(env));
		expect(url.origin).toBe("https://media.example.com");
		expect(url.pathname).toBe("/bucket/m/original");
		expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
	});

	it("falls back to S3_ENDPOINT without a public endpoint", async () => {
		const url = await signedUrl(createS3PresignClient({ ...env, S3_PUBLIC_ENDPOINT: undefined }));
		expect(url.origin).toBe("http://rustfs:9000");
	});
});

describe("createS3Client", () => {
	it("keeps using the internal endpoint", async () => {
		const url = await signedUrl(createS3Client(env));
		expect(url.origin).toBe("http://rustfs:9000");
	});
});
