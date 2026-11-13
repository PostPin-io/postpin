import { describe, expect, it, vi } from "vitest";
import { GetObjectCommand, PutObjectCommand, type S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../../src/env/index.ts";
import { getTextObject, putTextObject } from "../../src/storage/objects.ts";

const env = { S3_BUCKET: "bucket" } as S3Env;

describe("putTextObject and getTextObject", () => {
	it("stores the text under the object's key and returns the key", async () => {
		const send = vi.fn().mockResolvedValue({});
		const key = await putTextObject(
			{ send } as unknown as S3,
			env,
			{ mediaId: "m1", type: "cutList" },
			"TITLE: x",
		);
		expect(key).toBe("m1/cutList");
		const put = send.mock.calls[0]![0];
		expect(put).toBeInstanceOf(PutObjectCommand);
		expect(put.input).toMatchObject({ Bucket: "bucket", Key: "m1/cutList", Body: "TITLE: x" });
	});

	it("reads it back", async () => {
		const send = vi.fn().mockResolvedValue({ Body: { transformToString: async () => "TITLE: x" } });
		expect(await getTextObject({ send } as unknown as S3, env, "m1/cutList")).toBe("TITLE: x");
		expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
	});

	it("throws without a body", async () => {
		const send = vi.fn().mockResolvedValue({});
		await expect(getTextObject({ send } as unknown as S3, env, "m1/cutList")).rejects.toThrow(
			"no body",
		);
	});
});
