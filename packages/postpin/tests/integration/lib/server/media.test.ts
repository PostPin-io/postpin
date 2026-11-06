import { beforeEach, describe, expect, it } from "vitest";
import {
	deleteMediaFiles,
	deleteMediaFolders,
	getMediaJobs,
	purgeExports,
	startMediaProcessing,
} from "#lib/server/media.ts";
import { contentWorld } from "../../../helpers/content-world.ts";
import { prisma } from "../../../helpers/db.ts";
import { fakeBucket } from "../../../helpers/fake-bucket.ts";
import * as f from "../../../helpers/factories.ts";
import { fakes } from "../../../helpers/fakes.ts";

let mediaId: string;

beforeEach(async () => {
	const original = await prisma.mediaFile.create({ data: {} });
	mediaId = (await prisma.media.create({ data: { originalId: original.id } })).id;
});

type FlowNode = {
	name: string;
	queueName: string;
	data: Record<string, unknown>;
	opts?: Record<string, unknown>;
	children?: FlowNode[];
};

describe("startMediaProcessing", () => {
	it("adds one flow per media and sets the media to PROCESSING", async () => {
		await startMediaProcessing(mediaId);

		expect(fakes.queue).toHaveLength(1);
		expect(fakes.queue[0]).toMatchObject({ queue: "flow", method: "add" });
		const flow = fakes.queue[0]!.args[0] as FlowNode;
		expect(flow).toMatchObject({
			name: "setMediaProcessingDone",
			queueName: "media-light",
			data: { mediaId },
			// jobId = mediaId: getMediaJobs finds the flow by it, and BullMQ dedupes restarts
			opts: { jobId: mediaId },
		});
		expect((await prisma.media.findUniqueOrThrow({ where: { id: mediaId } })).status).toBe(
			"PROCESSING",
		);
	});

	it("flow: probe, thumbnail, barcode → sprites → 480p, shot thumbnails, 1080p and 720p", async () => {
		await startMediaProcessing(mediaId);
		const flow = fakes.queue[0]!.args[0] as FlowNode;

		const tree = (n: FlowNode): unknown => {
			const label =
				n.name === "transcode"
					? `transcode ${(n.data.video as { height: number }).height}p`
					: n.name;
			return n.children?.length ? { [label]: n.children.map(tree) } : label;
		};
		expect(flow.children!.map(tree)).toEqual([
			"probe",
			"thumbnail",
			{ movieBarcode: [{ seekSprites: ["transcode 480p"] }] },
			"shotThumbnails",
			"transcode 1080p",
			"transcode 720p",
		]);

		const all = (nodes: FlowNode[]): FlowNode[] =>
			nodes.flatMap((n) => [n, ...all(n.children ?? [])]);
		const children = all(flow.children!);
		expect(children.every((c) => c.data.mediaId === mediaId)).toBe(true);
		expect(children.every((c) => c.opts?.failParentOnFailure === true)).toBe(true);
		const transcodes = children.filter((c) => c.name === "transcode");
		expect(transcodes.every((c) => c.queueName === "media-heavy")).toBe(true);
		expect(
			children.filter((c) => c.name !== "transcode").every((c) => c.queueName === "media-light"),
		).toBe(true);
		expect(transcodes.map((c) => c.data.video)).toEqual([
			{ width: 854, height: 480, bitRate: 1_200_000, codec: "h264" },
			{ width: 1920, height: 1080, bitRate: 8_000_000, codec: "h264" },
			{ width: 1280, height: 720, bitRate: 3_500_000, codec: "h264" },
		]);
	});

	it("queues the flow before the DB update, so an unknown id throws after queueing", async () => {
		await expect(startMediaProcessing("nope")).rejects.toThrow();
		expect(fakes.queue).toHaveLength(1);
	});
});

describe("getMediaJobs", () => {
	const job = (name: string, state: string, extra: Record<string, unknown> = {}) => ({
		job: {
			id: `${name}-${state}`,
			name,
			data: {},
			progress: 0,
			failedReason: undefined,
			getState: async () => state,
			...extra,
		},
	});

	it("empty when there is no flow", async () => {
		expect(await getMediaJobs(mediaId)).toEqual([]);
	});

	it("looks up the flow by media id in the light queue", async () => {
		const asked: unknown[] = [];
		fakes.getFlow = (opts) => (asked.push(opts), undefined);
		await getMediaJobs(mediaId);
		expect(asked).toEqual([{ id: mediaId, queueName: "media-light" }]);
	});

	it("flattens all descendants (not the root), labels, weights and sorts them", async () => {
		fakes.getFlow = () => ({
			...job("setMediaProcessingDone", "waiting-children"),
			children: [
				job("probe", "completed", { progress: 100 }),
				{
					...job("movieBarcode", "waiting-children"),
					children: [
						{
							...job("seekSprites", "waiting-children"),
							children: [
								job("transcode", "active", { data: { video: { height: 480 } }, progress: 40 }),
							],
						},
					],
				},
				job("transcode", "active", { data: { video: { height: 1080 } }, progress: { frame: 3 } }),
				job("thumbnail", "failed", { failedReason: "boom" }),
				job("custom", "waiting"),
			],
		});

		const jobs = await getMediaJobs(mediaId);
		expect(jobs.map((j) => [j.label, j.state, j.progress, j.weight])).toEqual([
			// state order: active, …, waiting-children, waiting, …, failed, completed; then label (numeric)
			["Transcode 480p", "active", 40, 100],
			["Transcode 1080p", "active", 0, 100],
			["Movie Barcode", "waiting-children", 0, 50],
			["Seek Thumbnails", "waiting-children", 0, 50],
			["custom", "waiting", 0, 1],
			["Generate Thumbnail", "failed", 0, 10],
			["Analyze Media", "completed", 100, 10],
		]);
		expect(jobs.find((j) => j.state === "failed")!.failedReason).toBe("boom");
		expect(jobs.some((j) => j.label === "Done")).toBe(false);
	});
});

describe("deleteMediaFiles", () => {
	it("deletes every object below the media's prefix, page by page", async () => {
		const keys = Array.from({ length: 5 }, (_, i) => `${mediaId}/file-${i}`);
		const bucket = fakeBucket([...keys, `${mediaId}x/other`, "unrelated/file"], 2);

		await deleteMediaFiles(mediaId);

		expect(bucket.listedPrefixes()).toEqual([`${mediaId}/`, `${mediaId}/`, `${mediaId}/`]);
		expect(bucket.deletedKeys()).toEqual(keys);
		const deletes = fakes.s3.filter((c) => c.command === "DeleteObjectsCommand");
		expect(deletes).toHaveLength(3);
		expect(deletes.every((c) => c.input.Bucket === "postpin-test")).toBe(true);
	});

	it("sends no DeleteObjects for an empty prefix", async () => {
		fakeBucket([]);
		await deleteMediaFiles(mediaId);
		expect(fakes.s3.map((c) => c.command)).toEqual(["ListObjectsV2Command"]);
	});

	it("passes the continuation token on", async () => {
		fakeBucket([`${mediaId}/a`, `${mediaId}/b`], 1);
		await deleteMediaFiles(mediaId);
		const tokens = fakes.s3
			.filter((c) => c.command === "ListObjectsV2Command")
			.map((c) => c.input.ContinuationToken);
		expect(tokens).toEqual([undefined, "1"]);
	});
});

describe("purgeExports", () => {
	it("deletes markers, responses and media of the matching exports, returns the media ids", async () => {
		const w = await contentWorld();
		const thumbnailOf = await prisma.thumbnail.create({
			data: { mediaId: w.exp1.mediaId!, contentType: "image/jpeg", frame: 0 },
		});
		const m1 = await f.createMarker(w.exp1, w.catA);
		await f.createMarker(w.exp1b, w.catA); // export without media
		await prisma.response.create({ data: { markerId: m1.id, content: "ok" } });
		const keep = await f.createMarker(w.exp2, w.catA); // other timeline, same project

		const ids = await prisma.$transaction((tx) => purgeExports(tx, { timelineId: w.tl1.id }));

		expect(ids).toEqual([w.exp1.mediaId]);
		expect(await prisma.marker.findMany({ select: { id: true } })).toEqual([{ id: keep.id }]);
		expect(await prisma.response.count()).toBe(0);
		expect(await prisma.media.count({ where: { id: w.exp1.mediaId! } })).toBe(0);
		expect(await prisma.thumbnail.count({ where: { id: thumbnailOf.id } })).toBe(0);
		// media cascades to its export; the export without media is left for the caller's cascade
		expect(await prisma.export.count({ where: { id: w.exp1.id } })).toBe(0);
		expect(await prisma.export.count({ where: { id: w.exp1b.id } })).toBe(1);
		// categories are not purgeExports' business
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
		// never touches the bucket itself
		expect(fakes.s3).toEqual([]);
	});

	it("is undone when the surrounding transaction fails", async () => {
		const w = await contentWorld();
		await f.createMarker(w.exp1, w.catA);

		await expect(
			prisma.$transaction(async (tx) => {
				await purgeExports(tx, { timelineId: w.tl1.id });
				throw new Error("later step failed");
			}),
		).rejects.toThrow("later step failed");

		expect(await prisma.marker.count({ where: { exportId: w.exp1.id } })).toBe(1);
		expect(await prisma.media.count({ where: { id: w.exp1.mediaId! } })).toBe(1);
	});

	it("returns [] and deletes nothing when no export matches", async () => {
		const w = await contentWorld();
		const marker = await f.createMarker(w.exp1, w.catA);
		const ids = await prisma.$transaction((tx) => purgeExports(tx, { timelineId: "nope" }));
		expect(ids).toEqual([]);
		expect(await prisma.marker.count({ where: { id: marker.id } })).toBe(1);
	});

	// The reason purgeExports exists must not be "fixed" by loosening the FK:
	// a category that still has markers stays undeletable on its own.
	it("leaves the category protection in place", async () => {
		const w = await contentWorld();
		await f.createMarker(w.exp1, w.catA);
		await expect(prisma.category.delete({ where: { id: w.catA.id } })).rejects.toMatchObject({
			code: "P2003",
		});
	});
});

describe("deleteMediaFolders", () => {
	it("deletes every folder and doesn't throw when some fail", async () => {
		fakes.s3Respond = (call) => {
			if (call.command === "ListObjectsV2Command" && call.input.Prefix === "bad/") {
				throw new Error("S3 down");
			}
			return call.command === "ListObjectsV2Command"
				? { Contents: [{ Key: `${call.input.Prefix}original` }] }
				: {};
		};

		await expect(deleteMediaFolders(["a", "bad", "b"], "test")).resolves.toBeUndefined();

		const deleted = fakes.s3
			.filter((c) => c.command === "DeleteObjectsCommand")
			.flatMap((c) => (c.input.Delete as { Objects: { Key: string }[] }).Objects.map((o) => o.Key));
		expect(deleted.sort()).toEqual(["a/original", "b/original"]);
	});
});
