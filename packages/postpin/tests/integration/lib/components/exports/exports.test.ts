import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { deleteExport, renameExport } from "#lib/components/exports/exports.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import { fakeBucket } from "../../../../helpers/fake-bucket.ts";
import * as f from "../../../../helpers/factories.ts";
import { fakes } from "../../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const nameOf = async (id: string) =>
	(await prisma.export.findUniqueOrThrow({ where: { id } })).name;

describe("renameExport", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(renameExport({ id: w.exp1.id, name: "x" }), 401);
	});

	it.each([OWNER, ADMIN, MEMBER])("a %s with access renames; the name is trimmed", async (role) => {
		await signInAs(w.org, role, role === MEMBER ? [{ timelineId: w.tl1.id }] : []);
		await renameExport({ id: w.exp1.id, name: "  Final v2  " });
		expect(await nameOf(w.exp1.id)).toBe("Final v2");
	});

	it("403 for a reviewer with access", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(renameExport({ id: w.exp1.id, name: "x" }), 403);
		expect(await nameOf(w.exp1.id)).toBe(w.exp1.name);
	});

	it("404 for a member without a grant, and for another org", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(renameExport({ id: w.exp1.id, name: "x" }), 404);
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameExport({ id: w.otherExp.id, name: "x" }), 404);
		expect(await nameOf(w.otherExp.id)).toBe(w.otherExp.name);
	});

	it.each([
		["blank", "   "],
		["longer than 100 characters", "x".repeat(101)],
	])("400 for a name that is %s", async (_, name) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameExport({ id: w.exp1.id, name }), 400);
	});
});

describe("deleteExport", () => {
	it("deletes export, media, media files, markers; removes the media's S3 objects", async () => {
		const mediaId = w.exp1.mediaId!;
		const bucket = fakeBucket([
			`${mediaId}/original`,
			`${mediaId}/proxy-1`,
			`${w.otherExp.mediaId}/original`,
		]);
		await f.createMarker(w.exp1, w.catA);
		await f.createShareLink(w.exp1);
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);

		await deleteExport({ id: w.exp1.id });

		expect(await prisma.export.count({ where: { id: w.exp1.id } })).toBe(0);
		expect(await prisma.media.count({ where: { id: mediaId } })).toBe(0);
		expect(await prisma.marker.count()).toBe(0);
		expect(await prisma.shareLink.count()).toBe(0);
		expect(bucket.listedPrefixes()).toEqual([`${mediaId}/`]);
		expect(bucket.deletedKeys()).toEqual([`${mediaId}/original`, `${mediaId}/proxy-1`]);
		// other exports untouched
		expect(await prisma.export.count()).toBe(4);
	});

	it("also removes the original media file row", async () => {
		const originalId = (await prisma.media.findUniqueOrThrow({ where: { id: w.exp1.mediaId! } }))
			.originalId;
		signIn(w.owner.user, w.org.id);
		await deleteExport({ id: w.exp1.id });
		expect(await prisma.mediaFile.count({ where: { id: originalId } })).toBe(0);
	});

	it("an export without media is deleted without touching S3", async () => {
		signIn(w.owner.user, w.org.id);
		await deleteExport({ id: w.exp1b.id });
		expect(await prisma.export.count({ where: { id: w.exp1b.id } })).toBe(0);
		expect(fakes.s3).toEqual([]);
	});

	it("403 for a reviewer, nothing deleted", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(deleteExport({ id: w.exp1.id }), 403);
		expect(await prisma.export.count({ where: { id: w.exp1.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("404 for another org's export, nothing deleted", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteExport({ id: w.otherExp.id }), 404);
		expect(await prisma.export.count({ where: { id: w.otherExp.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});
});
