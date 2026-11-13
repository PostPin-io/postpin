import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import {
	abortWebUpload,
	completeWebUpload,
	createWebExport,
	getUploadLimits,
	initWebUpload,
	resumeWebUpload,
	type UploadForm,
} from "#lib/components/exports/upload.remote.ts";
import { ExportController } from "../../../../../src/api/controllers/ExportController.ts";
import { expectHttpError, signInApi } from "../../../../helpers/api.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import { fakeMultipart } from "../../../../helpers/fake-bucket.ts";
import { fakes, type S3Call } from "../../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";
import { storedExport } from "../../../../helpers/storage.ts";
import { setUploadMaxFileSize } from "../../../../helpers/upload-limits.ts";

const { OWNER, MEMBER, REVIEWER } = Role;
const MiB = 1024 * 1024;

let w: ContentWorld;
let bucket: ReturnType<typeof fakeMultipart>;

beforeEach(async () => {
	w = await contentWorld();
	bucket = fakeMultipart();
});

const FPS_24 = { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false };
const form = (over: Partial<UploadForm> = {}): UploadForm => ({
	fileName: "trailer_v3.mov",
	frameRate: FPS_24,
	startFrameIndex: 86400,
	durationFrameCount: 240,
	userSet: [],
	cutLevel: "medium",
	...over,
});

const s3Commands = () => fakes.s3.map((c) => c.command);
const snapshotOf = async (id: string) =>
	(await prisma.export.findUniqueOrThrow({ where: { id } }))
		.timelineSnapshot as unknown as TimelineSnapshot | null;
const flows = () => fakes.queue.filter((q) => q.queue === "flow").map((q) => q.args[0]);
const reservedSize = async (exportId: string) =>
	(
		await prisma.export.findUniqueOrThrow({
			where: { id: exportId },
			include: { media: { include: { original: true } } },
		})
	).media?.original.size;

/** A web export in tl1 with an upload in progress */
async function startedUpload(fileSize = 100 * MiB) {
	const { id } = await createWebExport({
		projectId: w.projectA.id,
		timelineId: w.tl1.id,
		name: "Trailer v3",
	});
	const upload = await initWebUpload({ exportId: id, fileSize });
	return { id, upload };
}

describe("createWebExport", () => {
	it("creates a named export for the uploader, without touching the NLE ids", async () => {
		await prisma.timeline.update({ where: { id: w.tl1.id }, data: { nleTimelineId: "nle-tl" } });
		const member = await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const { id } = await createWebExport({
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			name: "  Trailer v3 ",
		});
		const exp = await prisma.export.findUniqueOrThrow({ where: { id } });
		expect(exp).toMatchObject({ name: "Trailer v3", uploadedById: member.user.id, mediaId: null });
		const tl = await prisma.timeline.findUniqueOrThrow({ where: { id: w.tl1.id } });
		expect(tl.nleTimelineId).toBe("nle-tl");
	});

	it("403 for a reviewer, 404 without access", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(
			createWebExport({ projectId: w.projectA.id, timelineId: w.tl1.id, name: "x" }),
			403,
		);
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(
			createWebExport({ projectId: w.projectA.id, timelineId: w.tl1.id, name: "x" }),
			404,
		);
		expect(await prisma.export.count({ where: { name: "x" } })).toBe(0);
	});

	it("404 when the timeline isn't in the project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			createWebExport({ projectId: w.projectB.id, timelineId: w.tl1.id, name: "x" }),
			404,
		);
	});

	it("400 for a blank name", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			createWebExport({ projectId: w.projectA.id, timelineId: w.tl1.id, name: "  " }),
			400,
		);
	});

	it("401 when signed out", async () => {
		signOut();
		await expectStatus(
			createWebExport({ projectId: w.projectA.id, timelineId: w.tl1.id, name: "x" }),
			401,
		);
	});
});

describe("initWebUpload", () => {
	it("reserves the size and returns presigned part URLs", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload(100 * MiB);
		expect(upload.uploadId).toBe("upload-1");
		expect(upload.parts).toHaveLength(4);
		expect(await reservedSize(id)).toBe(BigInt(100 * MiB));
	});

	it("403 for a reviewer, also on an export someone else started", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(initWebUpload({ exportId: w.exp1b.id, fileSize: 10 }), 403);
		expect(fakes.s3).toEqual([]);
	});

	it("413 above UPLOAD_MAX_FILE_SIZE, before anything is reserved", async () => {
		setUploadMaxFileSize(50 * MiB);
		signIn(w.owner.user, w.org.id);
		const { id } = await createWebExport({
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			name: "big",
		});
		await expectStatus(initWebUpload({ exportId: id, fileSize: 50 * MiB + 1 }), 413);
		expect(await reservedSize(id)).toBeUndefined();
		expect(fakes.s3).toEqual([]);

		// exactly the limit is fine
		await initWebUpload({ exportId: id, fileSize: 50 * MiB });
		expect(await reservedSize(id)).toBe(BigInt(50 * MiB));
	});

	it("413 when the quota is full", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 1000n } });
		await storedExport(w.tl2, { original: 900 });
		signIn(w.owner.user, w.org.id);
		const { id } = await createWebExport({
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			name: "x",
		});
		await expectStatus(initWebUpload({ exportId: id, fileSize: 101 }), 413);
		await initWebUpload({ exportId: id, fileSize: 100 });
	});

	it.each([0, -1, 1.5])("400 for fileSize %s", async (fileSize) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(initWebUpload({ exportId: w.exp1b.id, fileSize }), 400);
	});
});

describe("UPLOAD_MAX_FILE_SIZE for plugins", () => {
	it("init-upload of the plugin API answers 413 too", async () => {
		setUploadMaxFileSize(10 * MiB);
		await signInApi(w.owner.user, w.org.id);
		const controller = new ExportController();
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl1.id, w.exp1b.id, { fileSize: 10 * MiB + 1 }),
			413,
		);
		expect(fakes.s3).toEqual([]);
	});
});

describe("completeWebUpload", () => {
	// every part of startedUpload()'s 100 MiB file: 3 × 32 MiB and 4 MiB
	let parts: { partNumber: number; etag: string }[];
	beforeEach(() => {
		parts = bucket.putFile(100 * MiB);
	});

	it("stores the preliminary snapshot and queues the processing with cut detection", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await completeWebUpload({
			exportId: id,
			uploadId: upload.uploadId,
			parts,
			form: form({ userSet: ["startFrameIndex"] }),
		});

		expect(s3Commands()).toContain("CompleteMultipartUploadCommand");
		const snapshot = await snapshotOf(id);
		expect(snapshot).toMatchObject({
			id,
			name: "Trailer v3",
			frameRate: FPS_24,
			startFrameIndex: 86400,
			durationFrameCount: 240,
			metadata: {
				source: "web-upload",
				estimated: true,
				userSet: ["startFrameIndex"],
				cutLevel: "medium",
				fileName: "trailer_v3.mov",
			},
		});
		expect(snapshot!.tracks).toEqual([
			{
				id: "V1",
				type: "video",
				name: "Video 1",
				clips: [expect.objectContaining({ startFrameIndex: 86400, durationFrameCount: 240 })],
			},
		]);

		const media = await prisma.media.findFirstOrThrow({ where: { export: { id } } });
		expect(media.status).toBe("PROCESSING");
		const flow = flows()[0] as { children: { name: string; children?: unknown[] }[] };
		// probe → sceneDetect → shotThumbnails
		expect(flow.children[0]).toMatchObject({
			name: "shotThumbnails",
			children: [{ name: "sceneDetect", children: [{ name: "probe" }] }],
		});
		expect(flow.children.filter((c) => c.name === "probe")).toEqual([]);
	});

	it("without cut detection, the shot thumbnails only wait for probe", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await completeWebUpload({
			exportId: id,
			uploadId: upload.uploadId,
			parts,
			form: form({ cutLevel: "none" }),
		});
		const flow = flows()[0] as { children: { name: string; children?: unknown[] }[] };
		expect(flow.children[0]).toMatchObject({
			name: "shotThumbnails",
			children: [{ name: "probe" }],
		});
		expect((await snapshotOf(id))!.metadata.cutLevel).toBe("none");
	});

	it("MXF: unknown values wait for probe and don't count as the uploader's", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await completeWebUpload({
			exportId: id,
			uploadId: upload.uploadId,
			parts,
			form: form({
				fileName: "a.mxf",
				frameRate: null,
				startFrameIndex: null,
				durationFrameCount: null,
				userSet: ["frameRate", "startFrameIndex"],
			}),
		});
		const snapshot = await snapshotOf(id);
		expect(snapshot).toMatchObject({ startFrameIndex: 0, durationFrameCount: 0 });
		expect(snapshot!.tracks[0]!.clips).toEqual([]);
		expect(snapshot!.metadata.userSet).toEqual([]);
	});

	it.each([
		["an unsupported frame rate", form({ frameRate: { ...FPS_24, fpsNumerator: 48 } })],
		[
			"drop-frame at 25",
			form({ frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: true } }),
		],
		["a start beyond 24 hours", form({ startFrameIndex: 24 * 86400 })],
		["a negative start", form({ startFrameIndex: -1 })],
	])("400 for %s", async (_, badForm) => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await expectStatus(
			completeWebUpload({ exportId: id, uploadId: upload.uploadId, parts, form: badForm }),
			400,
		);
		expect(await snapshotOf(id)).toBeNull();
	});

	it("403 for a reviewer, and nothing is stored", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(
			completeWebUpload({ exportId: id, uploadId: upload.uploadId, parts, form: form() }),
			403,
		);
		expect(await snapshotOf(id)).toBeNull();
		expect(flows()).toEqual([]);
	});

	it("409 when S3 can't assemble the file", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		const respond = fakes.s3Respond;
		fakes.s3Respond = (call) => {
			if (call.command === "CompleteMultipartUploadCommand") throw new Error("InvalidPart");
			return respond(call);
		};
		await expectStatus(
			completeWebUpload({ exportId: id, uploadId: upload.uploadId, parts, form: form() }),
			409,
		);
		expect(flows()).toEqual([]);
	});
});

describe("completeWebUpload checks what S3 really has", () => {
	const fileSize = 100 * MiB;
	const complete = (id: string, parts: { partNumber: number; etag: string }[]) =>
		completeWebUpload({ exportId: id, uploadId: "upload-1", parts, form: form() });
	const commands = (name: string) => fakes.s3.filter((c) => c.command === name);

	beforeEach(() => signIn(w.owner.user, w.org.id));

	it("413 for a part larger than announced: the upload is dropped and the space given back", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		// the last part should have 4 MiB; the presigned URL took 40
		parts[3] = bucket.put(4, 40 * MiB);

		await expectStatus(complete(id, parts), 413);
		expect(commands("CompleteMultipartUploadCommand")).toEqual([]);
		expect(commands("AbortMultipartUploadCommand")).toHaveLength(1);
		expect(await reservedSize(id)).toBe(0n);
		expect(await snapshotOf(id)).toBeNull();
		expect(flows()).toEqual([]);
		// nothing to continue; starting again works
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: "upload-1" }), 409);
		await initWebUpload({ exportId: id, fileSize });
	});

	it("409 for a missing part; the upload stays and can be continued", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize).filter((p) => p.partNumber !== 2);

		await expectStatus(complete(id, parts), 409);
		expect(commands("CompleteMultipartUploadCommand")).toEqual([]);
		expect(commands("AbortMultipartUploadCommand")).toEqual([]);
		expect(await reservedSize(id)).toBe(BigInt(fileSize));
		expect(flows()).toEqual([]);
	});

	it("409 for a part the client names but S3 doesn't have", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		const named = [...parts.slice(0, 3), { partNumber: 4, etag: '"never-uploaded"' }];

		await expectStatus(complete(id, named), 409);
		expect(commands("CompleteMultipartUploadCommand")).toEqual([]);
	});

	it("409 when the parts don't add up to the file: a part is short", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		parts[3] = bucket.put(4, 1 * MiB);

		await expectStatus(complete(id, parts), 409);
		expect(commands("CompleteMultipartUploadCommand")).toEqual([]);
		expect(await reservedSize(id)).toBe(BigInt(fileSize));
	});

	it("409 for a part number outside the file and for a part sent twice", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		await expectStatus(complete(id, [...parts, bucket.put(5, 1)]), 409);
		await expectStatus(complete(id, [...parts, parts[0]!]), 409);
		expect(commands("CompleteMultipartUploadCommand")).toEqual([]);
	});

	it("ETags count with and without quotes", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize).map((p) => ({ ...p, etag: p.etag.replaceAll('"', "") }));
		await complete(id, parts);
		expect(commands("CompleteMultipartUploadCommand")).toHaveLength(1);
	});

	it("413 when the assembled object is larger after all: it is deleted", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		bucket.onComplete((size) => size + 1);

		await expectStatus(complete(id, parts), 413);
		expect(commands("DeleteObjectCommand")).toHaveLength(1);
		expect(bucket.objectSize()).toBeNull();
		expect(await reservedSize(id)).toBe(0n);
		expect(await snapshotOf(id)).toBeNull();
		expect(flows()).toEqual([]);
	});

	it("409 when the assembled object is smaller: it is deleted", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		bucket.onComplete((size) => size - 1);

		await expectStatus(complete(id, parts), 409);
		expect(commands("DeleteObjectCommand")).toHaveLength(1);
		expect(await reservedSize(id)).toBe(0n);
		expect(flows()).toEqual([]);
	});

	it("keeps the file when S3 doesn't answer its size: the parts were checked", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		const respond = fakes.s3Respond;
		fakes.s3Respond = (call) => {
			if (call.command === "HeadObjectCommand") throw new Error("Timeout");
			return respond(call);
		};

		await complete(id, parts);
		expect(commands("DeleteObjectCommand")).toEqual([]);
		expect(await reservedSize(id)).toBe(BigInt(fileSize));
		expect(flows()).toHaveLength(1);
	});

	it("409 for a second complete that arrives while the first one assembles the file", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		const respond = fakes.s3Respond;
		let raced = false;
		fakes.s3Respond = async (call) => {
			// the first complete finishes while this one waits for S3
			if (call.command === "HeadObjectCommand" && !raced) {
				raced = true;
				await prisma.media.updateMany({
					where: { export: { id } },
					data: { status: "PROCESSING" },
				});
			}
			return respond(call);
		};

		await expectStatus(complete(id, parts), 409);
		// the file and the first one's processing stay untouched
		expect(commands("DeleteObjectCommand")).toEqual([]);
		expect(await reservedSize(id)).toBe(BigInt(fileSize));
		expect(await snapshotOf(id)).toBeNull();
		expect(flows()).toEqual([]);
		const media = await prisma.media.findFirstOrThrow({ where: { export: { id } } });
		expect(media.status).toBe("PROCESSING");
	});

	it("back to an unfinished upload when the processing can't be queued", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		// a snapshot Postgres can't store makes the step after the claim fail
		const failing = completeWebUpload({
			exportId: id,
			uploadId: "upload-1",
			parts,
			form: form({ fileName: "bad\u0000name.mov" }),
		});
		await expect(failing).rejects.toThrow();
		const media = await prisma.media.findFirstOrThrow({ where: { export: { id } } });
		expect(media.status).toBe("PENDING");
		expect(flows()).toEqual([]);
	});

	it("409 after the upload was cancelled", async () => {
		const { id } = await startedUpload(fileSize);
		const parts = bucket.putFile(fileSize);
		await abortWebUpload({ exportId: id, uploadId: "upload-1" });
		await expectStatus(complete(id, parts), 409);
	});
});

describe("abortWebUpload", () => {
	it("aborts the multipart upload and gives the reserved space back", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 150n } });
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload(100);
		// the reservation counts: a second upload of 100 bytes doesn't fit
		const second = await createWebExport({
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			name: "second",
		});
		await expectStatus(initWebUpload({ exportId: second.id, fileSize: 100 }), 413);

		await abortWebUpload({ exportId: id, uploadId: upload.uploadId });
		expect(fakes.s3.find((c) => c.command === "AbortMultipartUploadCommand")!.input).toMatchObject({
			UploadId: "upload-1",
		});
		expect(await reservedSize(id)).toBe(0n);
		await initWebUpload({ exportId: second.id, fileSize: 100 });
	});

	it("S3 not knowing the upload any more counts as aborted, and the space is given back", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload(100);
		const respond = fakes.s3Respond;
		fakes.s3Respond = (call) => {
			if (call.command === "AbortMultipartUploadCommand") {
				throw Object.assign(new Error("The specified upload does not exist."), {
					name: "NoSuchUpload",
				});
			}
			return respond(call);
		};
		await abortWebUpload({ exportId: id, uploadId: upload.uploadId });
		expect(await reservedSize(id)).toBe(0n);
	});

	it("other storage errors fail, and the reservation stays for another try", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload(100);
		fakes.s3Respond = (call) => {
			if (call.command === "AbortMultipartUploadCommand") throw new Error("SlowDown");
			return {};
		};
		// SvelteKit answers 500 for it, without the details
		await expect(abortWebUpload({ exportId: id, uploadId: upload.uploadId })).rejects.toThrow(
			"SlowDown",
		);
		expect(await reservedSize(id)).toBe(100n);
	});

	it("403 for a reviewer", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(abortWebUpload({ exportId: id, uploadId: upload.uploadId }), 403);
	});
});

describe("resumeWebUpload", () => {
	/** S3 has `numbers` of the upload, each of the right size for a 100 MiB file */
	function s3Has(numbers: number[], sizeOf = (n: number) => (n < 4 ? 32 * MiB : 4 * MiB)) {
		fakes.s3Respond = (call: S3Call) => {
			if (call.command === "CreateMultipartUploadCommand") return { UploadId: "upload-1" };
			if (call.command === "ListPartsCommand") {
				return { Parts: numbers.map((n) => ({ PartNumber: n, ETag: `"e${n}"`, Size: sizeOf(n) })) };
			}
			return {};
		};
	}

	it("returns the parts S3 has and fresh URLs for only the missing ones", async () => {
		signIn(w.owner.user, w.org.id);
		s3Has([1, 2]);
		const { id, upload } = await startedUpload(100 * MiB);
		const res = await resumeWebUpload({ exportId: id, uploadId: upload.uploadId });

		expect(res.partSize).toBe(upload.partSize);
		expect(res.uploaded).toEqual([
			{ partNumber: 1, etag: '"e1"' },
			{ partNumber: 2, etag: '"e2"' },
		]);
		expect(res.parts.map((p) => p.partNumber)).toEqual([3, 4]);
		expect(res.parts[0]!.url).toContain("partNumber=3");
		expect(res.parts[0]!.url).toContain("uploadId=upload-1");
	});

	it("uploads a part again when its size doesn't fit the file", async () => {
		signIn(w.owner.user, w.org.id);
		s3Has([1, 2], (n) => (n === 2 ? 5 : 32 * MiB));
		const { id, upload } = await startedUpload(100 * MiB);
		const res = await resumeWebUpload({ exportId: id, uploadId: upload.uploadId });
		expect(res.uploaded.map((p) => p.partNumber)).toEqual([1]);
		expect(res.parts.map((p) => p.partNumber)).toEqual([2, 3, 4]);
	});

	it("409 when S3 doesn't know the upload any more", async () => {
		signIn(w.owner.user, w.org.id);
		const { id } = await startedUpload();
		fakes.s3Respond = (call) => {
			if (call.command === "ListPartsCommand") throw new Error("NoSuchUpload");
			return {};
		};
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: "gone" }), 409);
	});

	it("409 after the upload was aborted, and once it is complete", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await abortWebUpload({ exportId: id, uploadId: upload.uploadId });
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 409);

		const other = await startedUpload();
		await completeWebUpload({
			exportId: other.id,
			uploadId: other.upload.uploadId,
			parts: bucket.putFile(100 * MiB),
			form: form(),
		});
		await expectStatus(resumeWebUpload({ exportId: other.id, uploadId: "upload-1" }), 409);
	});

	it("403 for a reviewer", async () => {
		signIn(w.owner.user, w.org.id);
		const { id, upload } = await startedUpload();
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 403);
	});
});

describe("resumeWebUpload renews the reservation", () => {
	/** Lets the upload's reservation run out, as after a pause of more than a day */
	const expire = (exportId: string) =>
		prisma.media.updateMany({
			where: { export: { id: exportId } },
			data: { reservedUntil: new Date(Date.now() - 1000) },
		});
	const reservedUntil = async (exportId: string) =>
		(await prisma.media.findFirstOrThrow({ where: { export: { id: exportId } } })).reservedUntil!;
	const DAY = 24 * 60 * 60 * 1000;

	beforeEach(() => signIn(w.owner.user, w.org.id));

	it("413 when the space was taken while the reservation had run out, and nothing is renewed", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 150n } });
		const { id, upload } = await startedUpload(100);
		await expire(id);
		// meanwhile someone else fills the organization
		await storedExport(w.tl2, { original: 100 });

		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 413);
		expect((await reservedUntil(id)).getTime()).toBeLessThan(Date.now());
	});

	it("an expired reservation doesn't count for others, until it is renewed", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 150n } });
		const { id, upload } = await startedUpload(100);
		const other = await createWebExport({
			projectId: w.projectA.id,
			timelineId: w.tl1.id,
			name: "other",
		});
		await expectStatus(initWebUpload({ exportId: other.id, fileSize: 100 }), 413);

		await expire(id);
		await initWebUpload({ exportId: other.id, fileSize: 100 });
		// now the first one doesn't fit any more
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 413);
	});

	it("renews the reservation for another day when it still fits", async () => {
		const { id, upload } = await startedUpload(100 * MiB);
		await expire(id);

		const res = await resumeWebUpload({ exportId: id, uploadId: upload.uploadId });
		expect(res.parts.length).toBe(4);
		expect((await reservedUntil(id)).getTime()).toBeGreaterThan(Date.now() + DAY - 60_000);
	});

	it("its own reservation doesn't count against it", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 100n } });
		const { id, upload } = await startedUpload(100);
		// fills the quota exactly, with itself
		await resumeWebUpload({ exportId: id, uploadId: upload.uploadId });
	});

	it("the export's uploader pays, also when someone else continues", async () => {
		const { id, upload } = await startedUpload(100);
		await prisma.user.update({ where: { id: w.owner.user.id }, data: { storageQuota: 50n } });
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 413);
	});

	it("413 when UPLOAD_MAX_FILE_SIZE was lowered meanwhile", async () => {
		const { id, upload } = await startedUpload(100 * MiB);
		setUploadMaxFileSize(50 * MiB);
		await expectStatus(resumeWebUpload({ exportId: id, uploadId: upload.uploadId }), 413);
	});

	it("init-upload again starts a new reservation", async () => {
		const { id } = await startedUpload(100);
		await expire(id);
		await initWebUpload({ exportId: id, fileSize: 100 });
		expect((await reservedUntil(id)).getTime()).toBeGreaterThan(Date.now() + DAY - 60_000);
	});
});

describe("getUploadLimits", () => {
	it("no limits by default", async () => {
		signIn(w.owner.user, w.org.id);
		expect(await getUploadLimits(w.tl1.id)).toEqual({ maxFileSize: null, available: null });
	});

	it("the file size limit and the smaller of the free org and user quota", async () => {
		setUploadMaxFileSize(20 * MiB);
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 1000n } });
		await storedExport(w.tl2, { original: 300 });
		const member = await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		expect(await getUploadLimits(w.tl1.id)).toEqual({
			maxFileSize: BigInt(20 * MiB),
			available: 700n,
		});

		await prisma.user.update({ where: { id: member.user.id }, data: { storageQuota: 50n } });
		expect((await getUploadLimits(w.tl1.id)).available).toBe(50n);
	});

	it("0 when the quota is overdrawn", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 10n } });
		await storedExport(w.tl2, { original: 300 });
		signIn(w.owner.user, w.org.id);
		expect((await getUploadLimits(w.tl1.id)).available).toBe(0n);
	});

	it("403 for a reviewer: they can't upload anyway", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(getUploadLimits(w.tl1.id), 403);
	});

	it.each([OWNER])("404 for another org's timeline (%s)", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getUploadLimits(w.otherTl.id), 404);
	});
});
