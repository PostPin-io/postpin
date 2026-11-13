import { describe, expect, it, vi } from "vitest";
import type { S3 } from "@aws-sdk/client-s3";
import type { S3Env } from "../../src/env/index.ts";
import {
	deleteShotThumbnails,
	shotThumbnailGeneration,
} from "../../src/storage/shot-thumbnails.ts";
import {
	newShotThumbnailsGeneration,
	shotThumbnailsPending,
} from "../../src/types/ShotThumbnails.ts";

const env = { S3_BUCKET: "bucket" } as S3Env;

describe("newShotThumbnailsGeneration", () => {
	it("sorts later generations after earlier ones, also across a change in digit count", () => {
		const times = [1, 35, 36, 1_700_000_000_000, 1_800_000_000_000, 36 ** 9 - 1];
		const generations = times.map((t) => newShotThumbnailsGeneration(t));
		expect([...generations].sort()).toEqual(generations);
		for (const g of generations) expect(g).toMatch(/^[0-9a-z]{13}$/);
	});

	it("keeps two generations of the same millisecond apart", () => {
		const generations = new Set(Array.from({ length: 50 }, () => newShotThumbnailsGeneration(5)));
		expect(generations.size).toBeGreaterThan(1);
	});
});

describe("shotThumbnailGeneration", () => {
	it.each([
		["m1/shotThumbnails-0mhx3k2a9b7c1-4", "0mhx3k2a9b7c1"],
		["m1/shotThumbnails-4", null],
	])("%s: %s", (key, generation) => {
		expect(shotThumbnailGeneration(key)).toBe(generation);
	});
});

describe("deleteShotThumbnails", () => {
	it("deletes the matching keys of every page and counts them", async () => {
		const listObjectsV2 = vi
			.fn()
			.mockResolvedValueOnce({
				Contents: [
					{ Key: "m1/shotThumbnails-0" },
					{ Key: "m1/shotThumbnails-g1-0" },
					{ Key: "m1/shotThumbnails-g2-0" },
				],
				NextContinuationToken: "next",
			})
			.mockResolvedValueOnce({ Contents: [{ Key: "m1/shotThumbnails-g1-1" }] });
		const deleteObjects = vi.fn().mockResolvedValue({});
		const client = { listObjectsV2, deleteObjects } as unknown as S3;

		const deleted = await deleteShotThumbnails(client, env, "m1", (g) => g !== "g2");

		expect(deleted).toBe(3);
		expect(listObjectsV2).toHaveBeenNthCalledWith(1, {
			Bucket: "bucket",
			Prefix: "m1/shotThumbnails-",
			ContinuationToken: undefined,
		});
		expect(listObjectsV2).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ ContinuationToken: "next" }),
		);
		expect(deleteObjects.mock.calls.map(([a]) => a.Delete.Objects)).toEqual([
			[{ Key: "m1/shotThumbnails-0" }, { Key: "m1/shotThumbnails-g1-0" }],
			[{ Key: "m1/shotThumbnails-g1-1" }],
		]);
	});

	it("sends no delete for a page without matches", async () => {
		const listObjectsV2 = vi
			.fn()
			.mockResolvedValue({ Contents: [{ Key: "m1/shotThumbnails-g2-0" }] });
		const deleteObjects = vi.fn();
		const client = { listObjectsV2, deleteObjects } as unknown as S3;
		expect(await deleteShotThumbnails(client, env, "m1", (g) => g === "g1")).toBe(0);
		expect(deleteObjects).not.toHaveBeenCalled();
	});
});

describe("shotThumbnailsPending", () => {
	const published = (generation?: string) => ({ count: 3, width: 320, height: 180, generation });

	it.each([
		["the requested generation is published", "g2", published("g2"), false],
		["the old thumbnails were cleared, the new ones aren't there yet", "g2", null, true],
		["an older generation is still published", "g2", published("g1"), true],
		["media from before generations", null, published(), false],
		["no thumbnails and nothing requested", null, null, false],
		["the requested generation is still rendering", "g2", { ...published("g2"), ready: 1 }, true],
		[
			"rendered completely, with `ready` left at the count",
			"g2",
			{ ...published("g2"), ready: 3 },
			false,
		],
	])("%s", (_, shotThumbnailsGeneration, shotThumbnails, pending) => {
		expect(shotThumbnailsPending({ shotThumbnailsGeneration, shotThumbnails })).toBe(pending);
	});
});
