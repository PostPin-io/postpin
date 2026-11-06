import { beforeEach, describe, expect, it, vi } from "vitest";

const presigner = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => presigner);

import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import { getPresignedUrl, getS3ObjectPath } from "../../src/storage/paths.ts";
import type { S3Env } from "../../src/env/index.ts";

const env = { S3_BUCKET: "bucket" } as S3Env;
const client = {} as S3;

beforeEach(() => {
	presigner.getSignedUrl.mockReset().mockResolvedValue("https://signed");
});

describe("getS3ObjectPath", () => {
	it.each([
		[{ mediaId: "m1", type: "original" }, "m1/original"],
		[{ mediaId: "m1", type: "proxy", proxyId: "p1" }, "m1/proxy-p1"],
		[{ mediaId: "m1", type: "sprite", index: 3 }, "m1/sprite-3"],
		// index 0 is a real index, not "missing"
		[{ mediaId: "m1", type: "shotThumbnails", index: 0 }, "m1/shotThumbnails-0"],
		[{ mediaId: "m1", type: "proxy", proxyId: "p1", index: 2 }, "m1/proxy-p1-2"],
		// an empty proxy id is left out
		[{ mediaId: "m1", type: "proxy", proxyId: "" }, "m1/proxy"],
	] as const)("builds the key for %j", (object, expected) => {
		expect(getS3ObjectPath(object)).toBe(expected);
	});
});

describe("getPresignedUrl", () => {
	it("signs a GET for an hour by default", async () => {
		await expect(getPresignedUrl(client, env, { mediaId: "m", type: "original" })).resolves.toBe(
			"https://signed",
		);
		const [usedClient, command, options] = presigner.getSignedUrl.mock.calls[0]!;
		expect(usedClient).toBe(client);
		expect(command).toBeInstanceOf(GetObjectCommand);
		expect(command.input).toEqual({ Bucket: "bucket", Key: "m/original" });
		expect(options).toEqual({ expiresIn: 3600 });
	});

	it("signs a PUT with a custom expiry", async () => {
		await getPresignedUrl(client, env, { mediaId: "m", type: "thumbnail" }, "put", 60);
		const [, command, options] = presigner.getSignedUrl.mock.calls[0]!;
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command.input).toEqual({ Bucket: "bucket", Key: "m/thumbnail" });
		expect(options).toEqual({ expiresIn: 60 });
	});
});
