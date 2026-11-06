import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	createTimeline,
	deleteTimeline,
	renameTimeline,
} from "#lib/components/TimelineModal.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../helpers/content-world.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import { fakeBucket } from "../../../helpers/fake-bucket.ts";
import * as f from "../../../helpers/factories.ts";
import { fakes } from "../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

describe("createTimeline", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(createTimeline({ name: "x", projectId: w.projectA.id }), 401);
	});

	it.each([OWNER, ADMIN, MEMBER])("a %s with access creates a timeline", async (role) => {
		await signInAs(w.org, role, role === MEMBER ? [{ projectId: w.projectA.id }] : []);
		await createTimeline({ name: "Reel 3", projectId: w.projectA.id });
		expect(
			await prisma.timeline.count({ where: { projectId: w.projectA.id, name: "Reel 3" } }),
		).toBe(1);
	});

	it("403 for a reviewer with a project grant", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(createTimeline({ name: "x", projectId: w.projectA.id }), 403);
		expect(await prisma.timeline.count({ where: { name: "x" } })).toBe(0);
	});

	it("rejects a member with only a timeline grant in the project", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		// can read the project via the timeline grant, so 403 rather than 404
		await expectStatus(createTimeline({ name: "x", projectId: w.projectA.id }), 403);
		expect(await prisma.timeline.count({ where: { name: "x" } })).toBe(0);
	});

	it("404 for another org's project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createTimeline({ name: "x", projectId: w.otherProject.id }), 404);
		expect(await prisma.timeline.count({ where: { name: "x" } })).toBe(0);
	});
});

describe("deleteTimeline", () => {
	it("deletes timeline, exports, markers and the exports' S3 objects", async () => {
		const exp2 = await f.createExport(w.tl1, { media: true });
		const bucket = fakeBucket([
			`${w.exp1.mediaId}/original`,
			`${exp2.mediaId}/original`,
			`${w.otherExp.mediaId}/original`,
		]);
		await f.createMarker(w.exp1, w.catA);
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);

		await deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id });

		expect(await prisma.timeline.count({ where: { id: w.tl1.id } })).toBe(0);
		expect(await prisma.export.count({ where: { timelineId: w.tl1.id } })).toBe(0);
		expect(await prisma.marker.count()).toBe(0);
		expect(bucket.deletedKeys().sort()).toEqual(
			[`${w.exp1.mediaId}/original`, `${exp2.mediaId}/original`].sort(),
		);
		// categories live on the project and survive
		expect(await prisma.category.count({ where: { id: w.catA.id } })).toBe(1);
		expect(await prisma.timeline.count({ where: { id: w.tl2.id } })).toBe(1);
	});

	// Export → Media cascades only from media to export, so purgeExports deletes the media explicitly
	it("also removes the media rows of the deleted exports", async () => {
		const original = (await prisma.media.findUniqueOrThrow({ where: { id: w.exp1.mediaId! } }))
			.originalId;
		signIn(w.owner.user, w.org.id);
		await deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id });
		expect(await prisma.media.count({ where: { id: w.exp1.mediaId! } })).toBe(0);
		expect(await prisma.mediaFile.count({ where: { id: original } })).toBe(0);
	});

	it("succeeds and only reports once, also with markers on an export without media", async () => {
		await f.createMarker(w.exp1b, w.catA); // exp1b has no media
		signIn(w.owner.user, w.org.id);
		// a second delete after the transaction would throw P2025 here
		await expect(
			deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id }),
		).resolves.toBeUndefined();
		expect(await prisma.marker.count({ where: { exportId: w.exp1b.id } })).toBe(0);
	});

	it("keeps the DB deletion when the bucket cleanup fails", async () => {
		fakes.s3Respond = () => {
			throw new Error("S3 down");
		};
		signIn(w.owner.user, w.org.id);
		await expect(
			deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id }),
		).resolves.toBeUndefined();
		expect(await prisma.timeline.count({ where: { id: w.tl1.id } })).toBe(0);
	});

	it("404 when projectId doesn't match the timeline, nothing deleted", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteTimeline({ id: w.tl1.id, projectId: w.projectB.id }), 404);
		expect(await prisma.timeline.count({ where: { id: w.tl1.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("403 for a reviewer, 404 for a member without a grant", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id }), 403);
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(deleteTimeline({ id: w.tl1.id, projectId: w.projectA.id }), 404);
		expect(await prisma.timeline.count({ where: { id: w.tl1.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("404 for another org's timeline", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteTimeline({ id: w.otherTl.id, projectId: w.otherProject.id }), 404);
		expect(await prisma.timeline.count({ where: { id: w.otherTl.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});
});

describe("renameTimeline", () => {
	const nameOf = async (id: string) =>
		(await prisma.timeline.findUniqueOrThrow({ where: { id } })).name;

	it("a member with a timeline grant renames; the name is trimmed", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		await renameTimeline({ id: w.tl1.id, projectId: w.projectA.id, name: "  Reel 1  " });
		expect(await nameOf(w.tl1.id)).toBe("Reel 1");
	});

	it("403 for a reviewer", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(renameTimeline({ id: w.tl1.id, projectId: w.projectA.id, name: "x" }), 403);
		expect(await nameOf(w.tl1.id)).toBe(w.tl1.name);
	});

	it("404 for another org's timeline", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			renameTimeline({ id: w.otherTl.id, projectId: w.otherProject.id, name: "x" }),
			404,
		);
		expect(await nameOf(w.otherTl.id)).toBe(w.otherTl.name);
	});

	it.each([
		["blank", "  "],
		["longer than 100 characters", "x".repeat(101)],
	])("400 for a name that is %s", async (_, name) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameTimeline({ id: w.tl1.id, projectId: w.projectA.id, name }), 400);
	});

	it("404 when projectId doesn't match the timeline", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameTimeline({ id: w.tl1.id, projectId: w.projectB.id, name: "x" }), 404);
	});
});
