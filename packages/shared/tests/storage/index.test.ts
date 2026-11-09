import { beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
	S3: vi.fn(function (this: Record<string, unknown>, config: unknown) {
		this.config = config;
	}),
}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
	...(await importOriginal<typeof import("@aws-sdk/client-s3")>()),
	S3: s3.S3,
}));

import type { S3 } from "@aws-sdk/client-s3";
import { createS3Client, ensureBucket, ensureCORS } from "../../src/storage/index.ts";
import type { S3Env } from "../../src/env/index.ts";

const env: S3Env = {
	S3_ENDPOINT: "http://minio:9000",
	S3_PUBLIC_ENDPOINT: undefined,
	S3_FORCE_PATH_STYLE: true,
	S3_ACCESS_KEY: "key",
	S3_SECRET_KEY: "secret",
	S3_BUCKET: "bucket",
	S3_REGION: "eu-central-1",
};

const client = {
	headBucket: vi.fn(),
	createBucket: vi.fn(),
	getBucketCors: vi.fn(),
	putBucketCors: vi.fn(),
};
const s3Client = client as unknown as S3;

const ORIGIN = "https://postpin.example";
const matchingRule = {
	AllowedHeaders: ["*"],
	AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
	AllowedOrigins: [ORIGIN],
	MaxAgeSeconds: 3000,
	ExposeHeaders: ["Content-Range", "Content-Length", "ETag"],
};

beforeEach(() => {
	vi.clearAllMocks();
	for (const fn of Object.values(client)) fn.mockReset().mockResolvedValue({});
});

describe("createS3Client", () => {
	it("passes endpoint, path style, region and credentials, and only checksums when required", () => {
		createS3Client(env);
		expect(s3.S3).toHaveBeenCalledWith({
			endpoint: "http://minio:9000",
			forcePathStyle: true,
			region: "eu-central-1",
			credentials: { accessKeyId: "key", secretAccessKey: "secret" },
			requestChecksumCalculation: "WHEN_REQUIRED",
			responseChecksumValidation: "WHEN_REQUIRED",
		});
	});
});

describe("ensureBucket", () => {
	it("does nothing when the bucket exists", async () => {
		await ensureBucket(s3Client, env);
		expect(client.headBucket).toHaveBeenCalledWith({ Bucket: "bucket" });
		expect(client.createBucket).not.toHaveBeenCalled();
	});

	it("creates the bucket when the head request fails", async () => {
		client.headBucket.mockRejectedValue(new Error("NotFound"));
		await ensureBucket(s3Client, env);
		expect(client.createBucket).toHaveBeenCalledWith({ Bucket: "bucket" });
	});
});

describe("ensureCORS", () => {
	it("leaves a matching configuration alone", async () => {
		client.getBucketCors.mockResolvedValue({ CORSRules: [matchingRule] });
		await ensureCORS(s3Client, env, ORIGIN);
		expect(client.putBucketCors).not.toHaveBeenCalled();
	});

	it("leaves the bucket alone when the origin is already allowed next to others", async () => {
		const shared = { ...matchingRule, AllowedOrigins: ["https://other", ORIGIN] };
		client.getBucketCors.mockResolvedValue({ CORSRules: [shared] });
		await ensureCORS(s3Client, env, ORIGIN);
		expect(client.putBucketCors).not.toHaveBeenCalled();
	});

	it("adds the origin and keeps the ones already allowed (another instance on the same bucket)", async () => {
		client.getBucketCors.mockResolvedValue({
			CORSRules: [
				{ ...matchingRule, AllowedOrigins: ["https://other"] },
				{ ...matchingRule, AllowedOrigins: ["https://third", "https://other"] },
			],
		});
		await ensureCORS(s3Client, env, ORIGIN);
		expect(client.putBucketCors).toHaveBeenCalledWith({
			Bucket: "bucket",
			CORSConfiguration: {
				CORSRules: [
					{ ...matchingRule, AllowedOrigins: ["https://other", "https://third", ORIGIN] },
				],
			},
		});
	});

	it.each([
		["no configuration", null],
		["no rules", {}],
		["other methods", { CORSRules: [{ ...matchingRule, AllowedMethods: ["GET"] }] }],
		["another max age", { CORSRules: [{ ...matchingRule, MaxAgeSeconds: 1 }] }],
		["other exposed headers", { CORSRules: [{ ...matchingRule, ExposeHeaders: [] }] }],
		["an extra rule", { CORSRules: [matchingRule, matchingRule] }],
	])("writes the configuration when the bucket has %s", async (_, current) => {
		client.getBucketCors.mockResolvedValue(current);
		await ensureCORS(s3Client, env, ORIGIN);
		expect(client.putBucketCors).toHaveBeenCalledWith({
			Bucket: "bucket",
			CORSConfiguration: { CORSRules: [matchingRule] },
		});
	});

	it("writes the configuration when reading it fails (S3 errors when none is set)", async () => {
		client.getBucketCors.mockRejectedValue(new Error("NoSuchCORSConfiguration"));
		await ensureCORS(s3Client, env, ORIGIN);
		expect(client.putBucketCors).toHaveBeenCalledOnce();
	});
});
