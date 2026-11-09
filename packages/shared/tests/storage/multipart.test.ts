import { beforeEach, describe, expect, it, vi } from "vitest";

const presigner = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => presigner);

import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	type S3,
} from "@aws-sdk/client-s3";
import {
	abortMultipartUpload,
	completeMultipartUpload,
	createMultipartUpload,
} from "../../src/storage/multipart.ts";
import type { S3Env } from "../../src/env/index.ts";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const env = { S3_BUCKET: "bucket" } as S3Env;
const object = { mediaId: "m", type: "original" } as const;

const send = vi.fn();
const client = { send } as unknown as S3;

beforeEach(() => {
	send.mockReset().mockResolvedValue({ UploadId: "upload-1" });
	presigner.getSignedUrl
		.mockReset()
		.mockImplementation(
			async (_client, command: UploadPartCommand) => `url-${command.input.PartNumber}`,
		);
});

describe("createMultipartUpload", () => {
	it("creates the upload for the object's key", async () => {
		await createMultipartUpload(client, env, object, 10);
		const command = send.mock.calls[0]![0];
		expect(command).toBeInstanceOf(CreateMultipartUploadCommand);
		expect(command.input).toEqual({ Bucket: "bucket", Key: "m/original" });
	});

	it("throws when S3 returns no upload id", async () => {
		send.mockResolvedValue({});
		await expect(createMultipartUpload(client, env, object, 10)).rejects.toThrow(/upload id/);
		expect(presigner.getSignedUrl).not.toHaveBeenCalled();
	});

	it("uses one 32 MiB part for small and empty files", async () => {
		for (const size of [0, 1, 32 * MiB]) {
			const upload = await createMultipartUpload(client, env, object, size);
			expect(upload.partSize).toBe(32 * MiB);
			expect(upload.parts).toHaveLength(1);
		}
	});

	it("splits into 32 MiB parts up to 10000 parts", async () => {
		const upload = await createMultipartUpload(client, env, object, 100 * MiB);
		expect(upload).toEqual({
			uploadId: "upload-1",
			partSize: 32 * MiB,
			parts: [1, 2, 3, 4].map((n) => ({ partNumber: n, url: `url-${n}` })),
		});
	});

	it("presigns each part for a day", async () => {
		await createMultipartUpload(client, env, object, 40 * MiB);
		for (const [i, [, command, options]] of presigner.getSignedUrl.mock.calls.entries()) {
			expect(command).toBeInstanceOf(UploadPartCommand);
			expect(command.input).toEqual({
				Bucket: "bucket",
				Key: "m/original",
				UploadId: "upload-1",
				PartNumber: i + 1,
			});
			expect(options).toEqual({ expiresIn: 86400 });
		}
	});

	it("signs the parts with the S3 client unless a presign client is given", async () => {
		await createMultipartUpload(client, env, object, 10);
		expect(presigner.getSignedUrl.mock.calls[0]![0]).toBe(client);

		presigner.getSignedUrl.mockClear();
		const presignClient = {} as S3;
		await createMultipartUpload(client, env, object, 10, presignClient);
		expect(presigner.getSignedUrl.mock.calls[0]![0]).toBe(presignClient);
		// the upload itself is still created through the S3 client
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("grows the part size in whole MiB so huge files stay within 10000 parts", async () => {
		const size = 1024 * GiB;
		const upload = await createMultipartUpload(client, env, object, size);
		expect(upload.partSize % MiB).toBe(0);
		expect(upload.partSize).toBe(105 * MiB);
		expect(upload.parts.length).toBeLessThanOrEqual(10000);
		expect(upload.parts.length * upload.partSize).toBeGreaterThanOrEqual(size);
	});
});

describe("completeMultipartUpload", () => {
	it("sends the parts sorted by part number, without changing the input", async () => {
		const parts = [
			{ partNumber: 2, etag: '"b"' },
			{ partNumber: 1, etag: '"a"' },
		];
		await completeMultipartUpload(client, env, object, "upload-1", parts);
		const command = send.mock.calls[0]![0];
		expect(command).toBeInstanceOf(CompleteMultipartUploadCommand);
		expect(command.input).toEqual({
			Bucket: "bucket",
			Key: "m/original",
			UploadId: "upload-1",
			MultipartUpload: {
				Parts: [
					{ PartNumber: 1, ETag: '"a"' },
					{ PartNumber: 2, ETag: '"b"' },
				],
			},
		});
		expect(parts[0]!.partNumber).toBe(2);
	});
});

describe("abortMultipartUpload", () => {
	it("aborts the upload of the object", async () => {
		await abortMultipartUpload(client, env, object, "upload-1");
		const command = send.mock.calls[0]![0];
		expect(command).toBeInstanceOf(AbortMultipartUploadCommand);
		expect(command.input).toEqual({ Bucket: "bucket", Key: "m/original", UploadId: "upload-1" });
	});
});
