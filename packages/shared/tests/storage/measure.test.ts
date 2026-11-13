import { describe, expect, it, vi } from "vitest";
import type { S3 } from "@aws-sdk/client-s3";
import { measureMediaImages } from "../../src/storage/measure.ts";
import type { S3Env } from "../../src/env/index.ts";

const env = { S3_BUCKET: "bucket" } as S3Env;

describe("measureMediaImages", () => {
	it("sums the images by type across pages and skips originals and proxies", async () => {
		const listObjectsV2 = vi
			.fn()
			.mockResolvedValueOnce({
				Contents: [
					{ Key: "m1/original", Size: 1_000_000 },
					{ Key: "m1/proxy-abc", Size: 500_000 },
					{ Key: "m1/thumbnail", Size: 40 },
					{ Key: "m1/sprite-0", Size: 100 },
				],
				NextContinuationToken: "next",
			})
			.mockResolvedValueOnce({
				Contents: [
					{ Key: "m1/sprite-1", Size: 50 },
					{ Key: "m1/shotThumbnails-0", Size: 7 },
					{ Key: "m1/shotThumbnails-12", Size: 3 },
					// with a generation in the key, still a shot thumbnail
					{ Key: "m1/shotThumbnails-0mhx3k2a9b7c1-0", Size: 10 },
				],
			});

		const sizes = await measureMediaImages({ listObjectsV2 } as unknown as S3, env, "m1");

		expect(sizes).toEqual({ thumbnailSize: 40n, seekSpritesSize: 150n, shotThumbnailsSize: 20n });
		expect(listObjectsV2).toHaveBeenNthCalledWith(1, {
			Bucket: "bucket",
			Prefix: "m1/",
			ContinuationToken: undefined,
		});
		expect(listObjectsV2).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ ContinuationToken: "next" }),
		);
	});

	it("is 0 for an empty folder", async () => {
		const listObjectsV2 = vi.fn().mockResolvedValue({});
		expect(await measureMediaImages({ listObjectsV2 } as unknown as S3, env, "m1")).toEqual({
			thumbnailSize: 0n,
			seekSpritesSize: 0n,
			shotThumbnailsSize: 0n,
		});
	});
});
