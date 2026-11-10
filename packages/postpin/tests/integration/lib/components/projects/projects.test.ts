import { beforeEach, describe, expect, it } from "vitest";
import { isHttpError } from "@sveltejs/kit";
import { Role } from "@postpin-io/shared/db/enums";
import {
	createProject,
	deleteProject,
	renameProject,
} from "#lib/components/projects/projects.remote.ts";
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

describe("createProject", () => {
	it.each([OWNER, ADMIN])(
		"a %s creates a project in the active org, without a grant",
		async (role) => {
			const me = await signInAs(w.org, role);
			await createProject({ name: "New film" });
			const p = await prisma.project.findFirstOrThrow({
				where: { name: "New film" },
				include: { memberGrants: true },
			});
			expect(p).toMatchObject({ organizationId: w.org.id, creatorId: me.user.id });
			expect(p.memberGrants).toEqual([]);
		},
	);

	it("a member without any grant creates a project and gets a project grant on it", async () => {
		const me = await signInAs(w.org, MEMBER);
		await createProject({ name: "Mine" });
		const p = await prisma.project.findFirstOrThrow({
			where: { name: "Mine" },
			include: { memberGrants: true },
		});
		expect(p.memberGrants).toEqual([
			expect.objectContaining({ memberId: me.id, createdById: me.user.id, timelineId: null }),
		]);
	});

	it("403 for a reviewer", async () => {
		await signInAs(w.org, REVIEWER);
		await expectStatus(createProject({ name: "x" }), 403);
		expect(await prisma.project.count({ where: { name: "x" } })).toBe(0);
	});

	it("404 when the active org is one the user isn't a member of", async () => {
		signIn(w.owner.user, w.other.id);
		await expectStatus(createProject({ name: "x" }), 404);
		expect(await prisma.project.count({ where: { name: "x" } })).toBe(0);
	});

	it("401 when signed out", async () => {
		signOut();
		await expectStatus(createProject({ name: "x" }), 401);
	});

	it("a clean 4xx without an active org", async () => {
		signIn(w.owner.user, null);
		const e = await createProject({ name: "x" }).catch((e: unknown) => e);
		expect(isHttpError(e) && e.status >= 400 && e.status < 500).toBe(true);
	});
});

describe("deleteProject", () => {
	it("deletes the project with everything below it and the S3 objects of its media", async () => {
		const bucket = fakeBucket([`${w.exp1.mediaId}/original`, `${w.otherExp.mediaId}/original`]);
		await f.createShareLink(w.exp1);
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);

		await deleteProject({ id: w.projectA.id });

		expect(await prisma.project.count({ where: { id: w.projectA.id } })).toBe(0);
		expect(await prisma.timeline.count({ where: { projectId: w.projectA.id } })).toBe(0);
		expect(await prisma.export.count({ where: { id: { in: [w.exp1.id, w.exp2.id] } } })).toBe(0);
		expect(await prisma.category.count({ where: { projectId: w.projectA.id } })).toBe(0);
		expect(await prisma.shareLink.count()).toBe(0);
		expect(bucket.deletedKeys()).toEqual([`${w.exp1.mediaId}/original`]);
		expect(await prisma.project.count({ where: { id: w.projectB.id } })).toBe(1);
	});

	// Regression: marker.categoryId is NO ACTION and Postgres checks it right after the
	// project → category cascade, before the export cascade reaches the markers (purgeExports).
	it("deletes a project that has markers and responses, on exports with and without media", async () => {
		const bucket = fakeBucket([`${w.exp1.mediaId}/original`]);
		const withMedia = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await f.createMarker(w.exp1b, w.catA); // exp1b has no media
		await f.createMarker(w.exp2, w.catA);
		await prisma.response.create({
			data: { markerId: withMedia.id, content: "ok", authorId: w.owner.user.id },
		});
		const untouched = await f.createMarker(w.expB, w.catB);
		signIn(w.owner.user, w.org.id);

		await deleteProject({ id: w.projectA.id });

		expect(await prisma.project.count({ where: { id: w.projectA.id } })).toBe(0);
		expect(await prisma.category.count({ where: { projectId: w.projectA.id } })).toBe(0);
		expect(await prisma.marker.findMany({ select: { id: true } })).toEqual([{ id: untouched.id }]);
		expect(await prisma.response.count()).toBe(0);
		expect(bucket.deletedKeys()).toEqual([`${w.exp1.mediaId}/original`]);
	});

	it("also removes the media rows of the project's exports", async () => {
		const original = (await prisma.media.findUniqueOrThrow({ where: { id: w.exp1.mediaId! } }))
			.originalId;
		signIn(w.owner.user, w.org.id);
		await deleteProject({ id: w.projectA.id });
		expect(await prisma.media.count({ where: { id: w.exp1.mediaId! } })).toBe(0);
		expect(await prisma.mediaFile.count({ where: { id: original } })).toBe(0);
		// the other org's media stays
		expect(await prisma.media.count({ where: { id: w.otherExp.mediaId! } })).toBe(1);
	});

	it("touches the bucket only after the DB transaction committed", async () => {
		await f.createMarker(w.exp1, w.catA);
		// The fake S3 awaits whatever s3Respond returns. This query runs on its own
		// connection, so it only sees the deletion once the transaction has committed.
		const projectsSeenByBucket: number[] = [];
		fakes.s3Respond = async () => {
			projectsSeenByBucket.push(await prisma.project.count({ where: { id: w.projectA.id } }));
			return {};
		};
		signIn(w.owner.user, w.org.id);

		await deleteProject({ id: w.projectA.id });

		expect(projectsSeenByBucket.length).toBeGreaterThan(0);
		expect(projectsSeenByBucket.every((n) => n === 0)).toBe(true);
	});

	it("keeps the DB deletion when the bucket cleanup fails", async () => {
		await f.createMarker(w.exp1, w.catA);
		fakes.s3Respond = () => {
			throw new Error("S3 down");
		};
		signIn(w.owner.user, w.org.id);

		await expect(deleteProject({ id: w.projectA.id })).resolves.toBeUndefined();

		expect(await prisma.project.count({ where: { id: w.projectA.id } })).toBe(0);
		expect(await prisma.media.count({ where: { id: w.exp1.mediaId! } })).toBe(0);
	});

	it("403 for a reviewer with a project grant", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(deleteProject({ id: w.projectA.id }), 403);
		expect(await prisma.project.count({ where: { id: w.projectA.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("refuses a member with only a timeline grant", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		await expectStatus(deleteProject({ id: w.projectA.id }), 403);
		expect(await prisma.project.count({ where: { id: w.projectA.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("404 for another org's project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(deleteProject({ id: w.otherProject.id }), 404);
		expect(await prisma.project.count({ where: { id: w.otherProject.id } })).toBe(1);
		expect(fakes.s3).toEqual([]);
	});

	it("401 when signed out", async () => {
		signOut();
		await expectStatus(deleteProject({ id: w.projectA.id }), 401);
	});
});

describe("renameProject", () => {
	const nameOf = async (id: string) =>
		(await prisma.project.findUniqueOrThrow({ where: { id } })).name;

	it("a member with a project grant renames; the name is trimmed", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await renameProject({ id: w.projectA.id, name: "  Renamed  " });
		expect(await nameOf(w.projectA.id)).toBe("Renamed");
	});

	it("403 for a reviewer", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(renameProject({ id: w.projectA.id, name: "x" }), 403);
		expect(await nameOf(w.projectA.id)).toBe(w.projectA.name);
	});

	it("refuses a member with only a timeline grant", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		await expectStatus(renameProject({ id: w.projectA.id, name: "x" }), 403);
		expect(await nameOf(w.projectA.id)).toBe(w.projectA.name);
	});

	it("404 for another org's project", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameProject({ id: w.otherProject.id, name: "x" }), 404);
		expect(await nameOf(w.otherProject.id)).toBe(w.otherProject.name);
	});

	it.each([
		["blank", " "],
		["longer than 100 characters", "x".repeat(101)],
	])("400 for a name that is %s", async (_, name) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(renameProject({ id: w.projectA.id, name }), 400);
	});
});
