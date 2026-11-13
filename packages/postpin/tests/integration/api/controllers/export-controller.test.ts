import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { ExportController } from "../../../../src/api/controllers/ExportController.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { fakes } from "../../../helpers/fakes.ts";
import { expectHttpError, signInApi } from "../../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../../helpers/api-world.ts";
import { signOut } from "../../../helpers/request-event.ts";
import { storedExport } from "../../../helpers/storage.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;
const MiB = 1024 * 1024;

let w: ApiWorld;
const controller = new ExportController();

beforeEach(async () => {
	w = await apiWorld();
	// S3 answers CreateMultipartUpload with an upload id
	fakes.s3Respond = (call) =>
		call.command === "CreateMultipartUploadCommand" ? { UploadId: "upload-1" } : {};
});

const snapshot = { id: "tl", name: "Timeline", tracks: [] } as unknown as TimelineSnapshot;
const s3Commands = () => fakes.s3.map((c) => c.command);

/** Export in tl1 with media in `status` */
async function exportWithMedia(status: "PENDING" | "PROCESSING" | "COMPLETED") {
	const exp = await f.createExport(w.tl1, { media: true });
	await prisma.media.update({ where: { id: exp.mediaId! }, data: { status } });
	return exp;
}

// ─── getExports ─────────────────────────────────────────────────────────────

describe("getExports", () => {
	it("lists the timeline's exports, newest first", async () => {
		const newer = await f.createExport(w.tl1);
		await signInApi(w.owner.user, w.org.id);
		const { exports } = await controller.getExports(w.projectA.id, w.tl1.id);
		expect(exports.map((e) => e.id)).toEqual([newer.id, w.exp1.id]);
		expect(Object.keys(exports[0]!).sort()).toEqual(["createdAt", "id", "name"]);
	});

	it("reviewer with a timeline grant may list", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		const { exports } = await controller.getExports(w.projectA.id, w.tl1.id);
		expect(exports.map((e) => e.id)).toEqual([w.exp1.id]);
	});

	it("404 for a timeline outside the member's grants", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await expectHttpError(controller.getExports(w.projectA.id, w.tl2.id), 404);
	});

	it("404 when the timeline is not in the project of the path", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(controller.getExports(w.projectB.id, w.tl1.id), 404);
	});

	it("404 for a timeline of another org", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(controller.getExports(w.otherProject.id, w.otherTimeline.id), 404);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(controller.getExports(w.projectA.id, w.tl1.id), 401);
	});
});

// ─── createExport ───────────────────────────────────────────────────────────

describe("createExport", () => {
	const noNle = { nleTimelineId: null, nleProjectId: null };

	it.each([OWNER, ADMIN])("%s creates an export", async (role) => {
		await signInAs(w, role);
		const { id } = await controller.createExport(w.projectA.id, w.tl1.id, noNle);
		const exp = await prisma.export.findUniqueOrThrow({ where: { id } });
		expect(exp).toMatchObject({ timelineId: w.tl1.id, mediaId: null });
		expect(exp.name).toMatch(/^Export \d{4}-\d\d-\d\dT/);
	});

	it("remembers who created the export, for the user's storage quota", async () => {
		const member = await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const { id } = await controller.createExport(w.projectA.id, w.tl1.id, noNle);
		const exp = await prisma.export.findUniqueOrThrow({ where: { id } });
		expect(exp.uploadedById).toBe(member.user.id);
	});

	it("member with a grant creates an export", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		const { id } = await controller.createExport(w.projectA.id, w.tl1.id, noNle);
		expect(await prisma.export.count({ where: { id, timelineId: w.tl1.id } })).toBe(1);
	});

	it("reviewer with a grant gets 403", async () => {
		await signInAs(w, REVIEWER, { projectId: w.projectA.id });
		await expectHttpError(controller.createExport(w.projectA.id, w.tl1.id, noNle), 403);
		expect(await prisma.export.count()).toBe(4);
	});

	it("member without a grant gets 404", async () => {
		await signInAs(w, MEMBER);
		await expectHttpError(controller.createExport(w.projectA.id, w.tl1.id, noNle), 404);
	});

	it("404 for a timeline of another org", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.createExport(w.otherProject.id, w.otherTimeline.id, noNle),
			404,
		);
	});

	it("404 when the path's project doesn't own the timeline, and nothing is changed", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.createExport(w.otherProject.id, w.tl1.id, {
				nleTimelineId: null,
				nleProjectId: "x",
			}),
			404,
		);
		const p = await prisma.project.findUniqueOrThrow({ where: { id: w.otherProject.id } });
		expect(p.nleProjectId).toBeNull();
	});

	it("links the timeline and project to their NLE ids", async () => {
		await signInApi(w.owner.user, w.org.id);
		await controller.createExport(w.projectA.id, w.tl1.id, {
			nleTimelineId: "nle-tl",
			nleProjectId: "nle-p",
		});
		const tl = await prisma.timeline.findUniqueOrThrow({ where: { id: w.tl1.id } });
		const p = await prisma.project.findUniqueOrThrow({ where: { id: w.projectA.id } });
		expect(tl.nleTimelineId).toBe("nle-tl");
		expect(p.nleProjectId).toBe("nle-p");
	});

	it("moves NLE ids that sit on another timeline/project of the same org", async () => {
		await prisma.timeline.update({ where: { id: w.tlB.id }, data: { nleTimelineId: "nle-tl" } });
		await prisma.project.update({ where: { id: w.projectB.id }, data: { nleProjectId: "nle-p" } });
		await signInApi(w.owner.user, w.org.id);
		await controller.createExport(w.projectA.id, w.tl1.id, {
			nleTimelineId: "nle-tl",
			nleProjectId: "nle-p",
		});

		expect(
			(await prisma.timeline.findUniqueOrThrow({ where: { id: w.tlB.id } })).nleTimelineId,
		).toBeNull();
		expect(
			(await prisma.project.findUniqueOrThrow({ where: { id: w.projectB.id } })).nleProjectId,
		).toBeNull();
		expect(
			(await prisma.timeline.findUniqueOrThrow({ where: { id: w.tl1.id } })).nleTimelineId,
		).toBe("nle-tl");
	});

	it("null NLE ids unlink the timeline and project", async () => {
		await prisma.timeline.update({ where: { id: w.tl1.id }, data: { nleTimelineId: "nle-tl" } });
		await prisma.project.update({ where: { id: w.projectA.id }, data: { nleProjectId: "nle-p" } });
		await signInApi(w.owner.user, w.org.id);
		await controller.createExport(w.projectA.id, w.tl1.id, noNle);
		expect(
			(await prisma.timeline.findUniqueOrThrow({ where: { id: w.tl1.id } })).nleTimelineId,
		).toBeNull();
		expect(
			(await prisma.project.findUniqueOrThrow({ where: { id: w.projectA.id } })).nleProjectId,
		).toBeNull();
	});

	// BUG: nleProjectId / nleTimelineId are globally @unique in the schema, but createExport only frees
	// them inside the caller's org. The same NLE project used in a second org makes the create fail.
	it("works when another org already uses the same NLE ids, without touching that org", async () => {
		await prisma.timeline.update({
			where: { id: w.otherTimeline.id },
			data: { nleTimelineId: "nle-tl" },
		});
		await prisma.project.update({
			where: { id: w.otherProject.id },
			data: { nleProjectId: "nle-p" },
		});
		await signInApi(w.owner.user, w.org.id);

		const { id } = await controller.createExport(w.projectA.id, w.tl1.id, {
			nleTimelineId: "nle-tl",
			nleProjectId: "nle-p",
		});

		expect(id).toBeTruthy();
		const otherTl = await prisma.timeline.findUniqueOrThrow({
			where: { id: w.otherTimeline.id },
		});
		expect(otherTl.nleTimelineId).toBe("nle-tl");
	});
});

// ─── initUpload ─────────────────────────────────────────────────────────────

describe("initUpload", () => {
	it.each([0, -1, 1.5, Number.NaN])("400 for fileSize %s", async (fileSize) => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl1.id, w.exp1.id, { fileSize }),
			400,
		);
		expect(fakes.s3).toEqual([]);
	});

	it("creates pending media and a multipart upload with presigned part URLs", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		const res = await controller.initUpload(w.projectA.id, w.tl1.id, w.exp1.id, {
			fileSize: 100 * MiB,
		});

		const exp = await prisma.export.findUniqueOrThrow({
			where: { id: w.exp1.id },
			include: { media: true },
		});
		expect(exp.media).toMatchObject({ id: res.mediaId, status: "PENDING" });
		expect(fakes.s3).toEqual([
			{
				command: "CreateMultipartUploadCommand",
				input: expect.objectContaining({ Bucket: "postpin-test", Key: `${res.mediaId}/original` }),
			},
		]);
		expect(res.uploadId).toBe("upload-1");
		expect(res.partSize).toBe(32 * MiB);
		expect(res.parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4]);
		const url = new URL(res.parts[1]!.url);
		expect(url.pathname).toBe(`/postpin-test/${res.mediaId}/original`);
		expect(url.searchParams.get("partNumber")).toBe("2");
		expect(url.searchParams.get("uploadId")).toBe("upload-1");
		expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
	});

	it("reuses media that is still pending", async () => {
		const exp = await exportWithMedia("PENDING");
		await signInApi(w.owner.user, w.org.id);
		const res = await controller.initUpload(w.projectA.id, w.tl1.id, exp.id, { fileSize: 1 });
		expect(res.mediaId).toBe(exp.mediaId);
		expect(res.parts).toHaveLength(1);
		expect(await prisma.media.count()).toBe(1);
	});

	it.each(["PROCESSING", "COMPLETED"] as const)("409 when media is %s", async (status) => {
		const exp = await exportWithMedia(status);
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl1.id, exp.id, { fileSize: 1 }),
			409,
		);
		expect(fakes.s3).toEqual([]);
	});

	it("reviewer gets 403", async () => {
		await signInAs(w, REVIEWER, { projectId: w.projectA.id });
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl1.id, w.exp1.id, { fileSize: 1 }),
			403,
		);
		expect(await prisma.media.count()).toBe(0);
	});

	it("member with a grant on another timeline gets 404", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl2.id });
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl1.id, w.exp1.id, { fileSize: 1 }),
			404,
		);
	});

	it("404 when the export is not in the timeline of the path", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.initUpload(w.projectA.id, w.tl2.id, w.exp1.id, { fileSize: 1 }),
			404,
		);
		expect(await prisma.media.count()).toBe(0);
	});

	it("404 for an export of another org", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.initUpload(w.otherProject.id, w.otherTimeline.id, w.otherExport.id, {
				fileSize: 1,
			}),
			404,
		);
	});
});

// ─── completeUpload ─────────────────────────────────────────────────────────

describe("completeUpload", () => {
	const parts = [
		{ partNumber: 2, etag: '"b"' },
		{ partNumber: 1, etag: '"a"' },
	];

	it("completes the upload, stores the snapshot and queues processing", async () => {
		const exp = await exportWithMedia("PENDING");
		await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await controller.completeUpload(w.projectA.id, w.tl1.id, exp.id, {
			uploadId: "upload-1",
			parts,
			timelineSnapshot: snapshot,
		});

		expect(fakes.s3).toEqual([
			{
				command: "CompleteMultipartUploadCommand",
				input: expect.objectContaining({
					Key: `${exp.mediaId}/original`,
					UploadId: "upload-1",
					MultipartUpload: {
						Parts: [
							{ PartNumber: 1, ETag: '"a"' },
							{ PartNumber: 2, ETag: '"b"' },
						],
					},
				}),
			},
		]);
		const saved = await prisma.export.findUniqueOrThrow({
			where: { id: exp.id },
			include: { media: true },
		});
		expect(saved.timelineSnapshot).toEqual(snapshot);
		expect(saved.media!.status).toBe("PROCESSING");

		expect(fakes.queue).toHaveLength(1);
		type Node = { name: string; data: unknown; children?: Node[] };
		const flow = fakes.queue[0]!.args[0] as Node & { opts: { jobId: string } };
		expect(fakes.queue[0]!.queue).toBe("flow");
		expect(flow.name).toBe("setMediaProcessingDone");
		expect(flow.opts.jobId).toBe(exp.mediaId);
		expect(flow.children!.map((c) => c.name)).toEqual(
			expect.arrayContaining(["probe", "thumbnail", "movieBarcode", "shotThumbnails"]),
		);
		// one transcode for all renditions, below the jobs that read its smallest proxy
		const all = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(all)];
		const transcodes = all(flow).filter((n) => n.name === "transcode");
		expect(transcodes).toHaveLength(1);
		expect((transcodes[0]!.data as { renditions: unknown[] }).renditions).toHaveLength(3);
	});

	it("409 when S3 can't complete the upload; nothing is queued", async () => {
		const exp = await exportWithMedia("PENDING");
		fakes.s3Respond = () => {
			throw new Error("InvalidPart");
		};
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.completeUpload(w.projectA.id, w.tl1.id, exp.id, {
				uploadId: "u",
				parts,
				timelineSnapshot: snapshot,
			}),
			409,
		);
		expect(fakes.queue).toEqual([]);
		const saved = await prisma.export.findUniqueOrThrow({
			where: { id: exp.id },
			include: { media: true },
		});
		expect(saved.media!.status).toBe("PENDING");
		expect(saved.timelineSnapshot).toBeNull();
	});

	it("409 when media is already processing", async () => {
		const exp = await exportWithMedia("PROCESSING");
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.completeUpload(w.projectA.id, w.tl1.id, exp.id, {
				uploadId: "u",
				parts,
				timelineSnapshot: snapshot,
			}),
			409,
		);
		expect(fakes.s3).toEqual([]);
	});

	it("404 when the export has no media yet", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.completeUpload(w.projectA.id, w.tl1.id, w.exp1.id, {
				uploadId: "u",
				parts,
				timelineSnapshot: snapshot,
			}),
			404,
		);
	});

	it("reviewer gets 403", async () => {
		const exp = await exportWithMedia("PENDING");
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectHttpError(
			controller.completeUpload(w.projectA.id, w.tl1.id, exp.id, {
				uploadId: "u",
				parts,
				timelineSnapshot: snapshot,
			}),
			403,
		);
		expect(fakes.s3).toEqual([]);
		expect(fakes.queue).toEqual([]);
	});
});

// ─── storage quota ──────────────────────────────────────────────────────────

describe("initUpload storage quota", () => {
	const init = (exportId: string, fileSize: number) =>
		controller.initUpload(w.projectA.id, w.tl1.id, exportId, { fileSize });

	it("reserves the file size on the original", async () => {
		await signInApi(w.owner.user, w.org.id);
		const res = await init(w.exp1.id, 42);
		const media = await prisma.media.findUniqueOrThrow({
			where: { id: res.mediaId },
			include: { original: true },
		});
		expect(media.original.size).toBe(42n);
	});

	it("413 when the organization is full, without creating media or an upload", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 1000n } });
		await storedExport(w.tl2, { original: 900 });
		await signInApi(w.owner.user, w.org.id);

		const err = await expectHttpError(init(w.exp1.id, 200), 413);
		expect((err as Error).message).toMatch(/^Organization storage is full/);
		expect(await prisma.export.findUniqueOrThrow({ where: { id: w.exp1.id } })).toMatchObject({
			mediaId: null,
		});
		expect(fakes.s3).toEqual([]);

		await expect(init(w.exp1.id, 100)).resolves.toMatchObject({ uploadId: "upload-1" });
	});

	it("413 when the uploader is full, counting other organizations", async () => {
		const member = await signInAs(w, MEMBER, { timelineId: w.tl1.id });
		await prisma.user.update({ where: { id: member.user.id }, data: { storageQuota: 100n } });
		await f.createMember(w.other, MEMBER, member.user);
		await storedExport(w.otherTimeline, { original: 60, uploadedBy: member.user });
		const { id } = await controller.createExport(w.projectA.id, w.tl1.id, {
			nleTimelineId: null,
			nleProjectId: null,
		});

		const err = await expectHttpError(init(id, 50), 413);
		expect((err as Error).message).toMatch(/^Your storage is full/);
	});

	it("charges the export's creator, not whoever retries the upload", async () => {
		const creator = await f.createMember(w.org, MEMBER);
		await prisma.user.update({ where: { id: creator.user.id }, data: { storageQuota: 10n } });
		await prisma.export.update({
			where: { id: w.exp1.id },
			data: { uploadedById: creator.user.id },
		});
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(init(w.exp1.id, 11), 413);
	});

	it("a retry doesn't count its own reservation twice", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 1000n } });
		await signInApi(w.owner.user, w.org.id);
		const first = await init(w.exp1.id, 800);
		const second = await init(w.exp1.id, 700);
		expect(second.mediaId).toBe(first.mediaId);
		const media = await prisma.media.findUniqueOrThrow({
			where: { id: first.mediaId },
			include: { original: true },
		});
		expect(media.original.size).toBe(700n);
	});

	it("409 for uploaded media comes before the quota check", async () => {
		await prisma.organization.update({ where: { id: w.org.id }, data: { storageQuota: 1n } });
		const exp = await exportWithMedia("COMPLETED");
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(init(exp.id, 100), 409);
	});
});

// ─── abortUpload ────────────────────────────────────────────────────────────

describe("abortUpload", () => {
	it("aborts the multipart upload in S3", async () => {
		const exp = await exportWithMedia("PENDING");
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		await prisma.mediaFile.update({
			where: {
				id: (await prisma.media.findUniqueOrThrow({ where: { id: exp.mediaId! } })).originalId,
			},
			data: { size: 500n },
		});
		await controller.abortUpload(w.projectA.id, w.tl1.id, exp.id, { uploadId: "upload-1" });
		// frees the reservation from initUpload
		const media = await prisma.media.findUniqueOrThrow({
			where: { id: exp.mediaId! },
			include: { original: true },
		});
		expect(media.original.size).toBe(0n);
		expect(fakes.s3).toEqual([
			{
				command: "AbortMultipartUploadCommand",
				input: expect.objectContaining({ Key: `${exp.mediaId}/original`, UploadId: "upload-1" }),
			},
		]);
	});

	it("409 once processing has started", async () => {
		const exp = await exportWithMedia("PROCESSING");
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.abortUpload(w.projectA.id, w.tl1.id, exp.id, { uploadId: "u" }),
			409,
		);
		expect(s3Commands()).toEqual([]);
	});

	it("404 for another org's export", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.abortUpload(w.otherProject.id, w.otherTimeline.id, w.otherExport.id, {
				uploadId: "u",
			}),
			404,
		);
	});

	it("reviewer gets 403", async () => {
		const exp = await exportWithMedia("PENDING");
		await signInAs(w, REVIEWER, { projectId: w.projectA.id });
		await expectHttpError(
			controller.abortUpload(w.projectA.id, w.tl1.id, exp.id, { uploadId: "u" }),
			403,
		);
		expect(s3Commands()).toEqual([]);
	});
});
