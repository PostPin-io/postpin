import { beforeEach, describe, expect, it, vi } from "vitest";

const presigner = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => presigner);

import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	ListPartsCommand,
	UploadPartCommand,
	type S3,
} from "@aws-sdk/client-s3";
import {
	abortMultipartUpload,
	checkUploadedParts,
	completeMultipartUpload,
	createMultipartUpload,
	deleteObject,
	expectedPartSize,
	getObjectSize,
	listUploadedParts,
	partLayout,
	presignPartUrls,
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

describe("partLayout", () => {
	it("matches the split createMultipartUpload signs", async () => {
		const res = await createMultipartUpload(client, env, object, 100 * MiB);
		expect(partLayout(100 * MiB)).toEqual({ partSize: res.partSize, partCount: res.parts.length });
		expect(partLayout(1)).toEqual({ partSize: 32 * MiB, partCount: 1 });
	});
});

describe("presignPartUrls", () => {
	it("signs only the requested parts of the upload", async () => {
		const urls = await presignPartUrls(client, env, object, "upload-1", [3, 5]);
		expect(urls).toEqual([
			{ partNumber: 3, url: "url-3" },
			{ partNumber: 5, url: "url-5" },
		]);
		const command = presigner.getSignedUrl.mock.calls[0]![1] as UploadPartCommand;
		expect(command.input).toEqual({
			Bucket: "bucket",
			Key: "m/original",
			UploadId: "upload-1",
			PartNumber: 3,
		});
	});
});

describe("listUploadedParts", () => {
	it("pages through ListParts and returns the parts sorted, with ETag and size", async () => {
		send
			.mockReset()
			.mockResolvedValueOnce({
				Parts: [
					{ PartNumber: 2, ETag: '"b"', Size: 10 },
					{ PartNumber: 1, ETag: '"a"', Size: 10 },
				],
				IsTruncated: true,
				NextPartNumberMarker: "2",
			})
			.mockResolvedValueOnce({
				Parts: [{ PartNumber: 4, ETag: '"d"', Size: 3 }, { PartNumber: 5 }],
			});

		const parts = await listUploadedParts(client, env, object, "upload-1");
		expect(parts).toEqual([
			{ partNumber: 1, etag: '"a"', size: 10 },
			{ partNumber: 2, etag: '"b"', size: 10 },
			{ partNumber: 4, etag: '"d"', size: 3 },
		]);
		const [first, second] = send.mock.calls.map((c) => c[0] as ListPartsCommand);
		expect(first).toBeInstanceOf(ListPartsCommand);
		expect(first!.input).toEqual({
			Bucket: "bucket",
			Key: "m/original",
			UploadId: "upload-1",
			PartNumberMarker: undefined,
		});
		expect(second!.input.PartNumberMarker).toBe("2");
	});

	it("throws when the upload doesn't exist", async () => {
		send.mockReset().mockRejectedValue(new Error("NoSuchUpload"));
		await expect(listUploadedParts(client, env, object, "nope")).rejects.toThrow("NoSuchUpload");
	});
});

describe("expectedPartSize", () => {
	it("full parts, then the rest", () => {
		const file = 100 * MiB;
		expect([1, 2, 3, 4].map((n) => expectedPartSize(n, file))).toEqual([
			32 * MiB,
			32 * MiB,
			32 * MiB,
			4 * MiB,
		]);
		// a file that fills its parts exactly has no short last part
		expect(expectedPartSize(2, 64 * MiB)).toBe(32 * MiB);
		expect(expectedPartSize(1, 10)).toBe(10);
	});
});

describe("checkUploadedParts", () => {
	const fileSize = 100 * MiB;
	const sizes = [32 * MiB, 32 * MiB, 32 * MiB, 4 * MiB];
	const stored = (sizeOf = (n: number) => sizes[n - 1]!) =>
		[1, 2, 3, 4].map((n) => ({ partNumber: n, etag: `"e${n}"`, size: sizeOf(n) }));
	const claimed = [1, 2, 3, 4].map((n) => ({ partNumber: n, etag: `"e${n}"` }));

	it("accepts exactly the file, in any order and with or without quotes around the ETag", () => {
		expect(checkUploadedParts(stored(), [...claimed].reverse(), fileSize)).toEqual({ ok: true });
		const unquoted = claimed.map((p) => ({ ...p, etag: p.etag.replaceAll('"', "") }));
		expect(checkUploadedParts(stored(), unquoted, fileSize)).toEqual({ ok: true });
	});

	it("ignores stored parts the client doesn't name", () => {
		const extra = [...stored(), { partNumber: 5, etag: '"x"', size: 999 * MiB }];
		expect(checkUploadedParts(extra, claimed, fileSize)).toEqual({ ok: true });
	});

	it.each([
		["a part larger than its share", stored((n) => (n === 4 ? 5 * MiB : sizes[n - 1]!)), claimed],
		["a middle part larger", stored((n) => (n === 2 ? 33 * MiB : sizes[n - 1]!)), claimed],
	])("too-large: %s", (_, listed, parts) => {
		expect(checkUploadedParts(listed, parts, fileSize)).toMatchObject({
			ok: false,
			reason: "too-large",
		});
	});

	it.each([
		["a missing part", stored(), claimed.slice(0, 3)],
		["a part S3 doesn't have", stored().slice(0, 3), claimed],
		["another ETag", stored(), [...claimed.slice(0, 3), { partNumber: 4, etag: '"other"' }]],
		["a short part", stored((n) => (n === 1 ? MiB : sizes[n - 1]!)), claimed],
		["a part twice", stored(), [...claimed, claimed[0]!]],
		["a part number past the file", stored(), [...claimed, { partNumber: 5, etag: '"e5"' }]],
		["part number 0", stored(), [{ partNumber: 0, etag: '"e0"' }, ...claimed]],
		["no parts at all", stored(), []],
	])("incomplete: %s", (_, listed, parts) => {
		expect(checkUploadedParts(listed, parts, fileSize)).toMatchObject({
			ok: false,
			reason: "incomplete",
		});
	});
});

describe("getObjectSize and deleteObject", () => {
	it("HEAD answers the size, null without one", async () => {
		send.mockResolvedValueOnce({ ContentLength: 42 }).mockResolvedValueOnce({});
		expect(await getObjectSize(client, env, object)).toBe(42);
		expect(await getObjectSize(client, env, object)).toBeNull();
		const head = send.mock.calls[0]![0];
		expect(head).toBeInstanceOf(HeadObjectCommand);
		expect(head.input).toEqual({ Bucket: "bucket", Key: "m/original" });
	});

	it("deletes the object", async () => {
		send.mockResolvedValueOnce({});
		await deleteObject(client, env, object);
		const del = send.mock.calls[0]![0];
		expect(del).toBeInstanceOf(DeleteObjectCommand);
		expect(del.input).toEqual({ Bucket: "bucket", Key: "m/original" });
	});
});
