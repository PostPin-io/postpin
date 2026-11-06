import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	deleteOrganization,
	getOrganizationSettings,
	renameOrganization,
} from "../../../../src/routes/(root)/organizations/[organization]/settings/settings.remote.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { fakes } from "../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

async function world() {
	const org = await f.createOrg({ name: "Acme" });
	const other = await f.createOrg({ name: "Other" });
	const owner = await f.createMember(org, OWNER);
	const admin = await f.createMember(org, ADMIN);
	const member = await f.createMember(org, MEMBER);
	const otherOwner = await f.createMember(other, OWNER);
	return { org, other, owner, admin, member, otherOwner };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

const as = (m: { user: { id: string; email: string; name: string } }, orgId = w.org.id) =>
	signIn(m.user, orgId);

// ─── getOrganizationSettings ────────────────────────────────────────────────

describe("getOrganizationSettings", () => {
	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(getOrganizationSettings(w.org.slug), 401);
	});

	it("404 for an unknown slug", async () => {
		as(w.owner);
		await expectStatus(getOrganizationSettings("nope"), 404);
	});

	it("404 for a non-member", async () => {
		as(w.otherOwner, w.other.id);
		await expectStatus(getOrganizationSettings(w.org.slug), 404);
	});

	it.each([MEMBER, REVIEWER])("403 for %s", async (role) => {
		const m = await f.createMember(w.org, role);
		as(m);
		await expectStatus(getOrganizationSettings(w.org.slug), 403);
	});

	it("admin may open settings but not rename or delete", async () => {
		as(w.admin);
		const res = await getOrganizationSettings(w.org.slug);
		expect(res).toMatchObject({
			id: w.org.id,
			name: "Acme",
			slug: w.org.slug,
			canRename: false,
			canDelete: false,
		});
		expect(res).not.toHaveProperty("members");
	});

	it("owner may rename and delete", async () => {
		as(w.owner);
		const res = await getOrganizationSettings(w.org.slug);
		expect(res).toMatchObject({ canRename: true, canDelete: true });
	});
});

// ─── renameOrganization ─────────────────────────────────────────────────────

describe("renameOrganization", () => {
	it("owner renames the org and changes its slug", async () => {
		as(w.owner);
		await renameOrganization({ organizationId: w.org.id, name: "  New Name ", slug: "new-name" });
		const org = await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } });
		expect(org).toMatchObject({ name: "New Name", slug: "new-name" });
	});

	it("admin cannot rename", async () => {
		as(w.admin);
		await expectStatus(renameOrganization({ organizationId: w.org.id, name: "X", slug: "x" }), 403);
		expect((await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).name).toBe(
			"Acme",
		);
	});

	it("member cannot rename", async () => {
		as(w.member);
		await expectStatus(renameOrganization({ organizationId: w.org.id, name: "X", slug: "x" }), 403);
	});

	it("owner of another org cannot rename this one", async () => {
		as(w.otherOwner, w.other.id);
		await expectStatus(renameOrganization({ organizationId: w.org.id, name: "X", slug: "x" }), 404);
	});

	it.each([
		["empty name", { name: "   ", slug: "ok" }],
		["name too long", { name: "x".repeat(101), slug: "ok" }],
		["uppercase slug", { name: "Ok", slug: "Not-OK" }],
		["slug with spaces", { name: "Ok", slug: "a b" }],
		["empty slug", { name: "Ok", slug: "" }],
	])("400 for %s", async (_label, input) => {
		as(w.owner);
		await expectStatus(renameOrganization({ organizationId: w.org.id, ...input }), 400);
	});

	it("409 when the slug is taken", async () => {
		as(w.owner);
		await expectStatus(
			renameOrganization({ organizationId: w.org.id, name: "X", slug: w.other.slug }),
			409,
		);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(renameOrganization({ organizationId: w.org.id, name: "X", slug: "x" }), 401);
	});
});

// ─── deleteOrganization ─────────────────────────────────────────────────────

describe("deleteOrganization", () => {
	it("owner deletes the org with everything in it and cleans up media in the bucket", async () => {
		const project = await f.createProject(w.org);
		const timeline = await f.createTimeline(project);
		const exp = await f.createExport(timeline, { media: true });
		await f.grant(w.member, { projectId: project.id });
		await f.createInvitation(w.org);
		await f.createInviteLink(w.org);

		const otherProject = await f.createProject(w.other);
		const otherExport = await f.createExport(await f.createTimeline(otherProject), { media: true });

		as(w.owner);
		await deleteOrganization({ organizationId: w.org.id, confirmName: " Acme " });

		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(0);
		expect(await prisma.member.count({ where: { organizationId: w.org.id } })).toBe(0);
		expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
		expect(await prisma.export.count({ where: { id: exp.id } })).toBe(0);
		expect(await prisma.media.count({ where: { id: exp.mediaId! } })).toBe(0);
		expect(await prisma.memberGrant.count()).toBe(0);
		expect(await prisma.invitation.count()).toBe(0);
		expect(await prisma.inviteLink.count()).toBe(0);
		// users keep their accounts
		expect(await prisma.user.count({ where: { id: w.owner.user.id } })).toBe(1);

		// the other org is untouched
		expect(await prisma.organization.count({ where: { id: w.other.id } })).toBe(1);
		expect(await prisma.media.count({ where: { id: otherExport.mediaId! } })).toBe(1);

		const listed = fakes.s3.filter((c) => c.command === "ListObjectsV2Command");
		expect(listed.map((c) => c.input.Prefix)).toEqual([`${exp.mediaId}/`]);
	});

	// Regression: the org → project → category cascade hit marker_categoryId_fkey (NO ACTION)
	// for markers on exports without media, which the old media-first delete didn't reach
	it("deletes an org whose projects have markers, also on exports without media", async () => {
		const project = await f.createProject(w.org);
		const timeline = await f.createTimeline(project);
		const withMedia = await f.createExport(timeline, { media: true });
		const withoutMedia = await f.createExport(timeline);
		const category = await f.createCategory(project);
		const marker = await f.createMarker(withMedia, category, { author: w.owner.user });
		await f.createMarker(withoutMedia, category);
		await prisma.response.create({
			data: { markerId: marker.id, content: "ok", authorId: w.member.user.id },
		});

		const otherProject = await f.createProject(w.other);
		const otherExport = await f.createExport(await f.createTimeline(otherProject));
		const otherMarker = await f.createMarker(otherExport, await f.createCategory(otherProject));

		as(w.owner);
		await deleteOrganization({ organizationId: w.org.id, confirmName: "Acme" });

		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(0);
		expect(await prisma.marker.findMany({ select: { id: true } })).toEqual([
			{ id: otherMarker.id },
		]);
		expect(await prisma.response.count()).toBe(0);
		expect(await prisma.media.count({ where: { id: withMedia.mediaId! } })).toBe(0);
	});

	it("keeps the DB deletion when the bucket cleanup fails", async () => {
		const project = await f.createProject(w.org);
		await f.createExport(await f.createTimeline(project), { media: true });
		fakes.s3Respond = () => {
			throw new Error("S3 down");
		};
		as(w.owner);
		await expect(
			deleteOrganization({ organizationId: w.org.id, confirmName: "Acme" }),
		).resolves.toBeUndefined();
		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(0);
	});

	it("400 when the name doesn't match", async () => {
		as(w.owner);
		await expectStatus(deleteOrganization({ organizationId: w.org.id, confirmName: "acme" }), 400);
		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(1);
	});

	it("admin cannot delete", async () => {
		as(w.admin);
		await expectStatus(deleteOrganization({ organizationId: w.org.id, confirmName: "Acme" }), 403);
		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(1);
	});

	it("owner of another org cannot delete this one", async () => {
		as(w.otherOwner, w.other.id);
		await expectStatus(deleteOrganization({ organizationId: w.org.id, confirmName: "Acme" }), 404);
		expect(await prisma.organization.count({ where: { id: w.org.id } })).toBe(1);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(deleteOrganization({ organizationId: w.org.id, confirmName: "Acme" }), 401);
	});
});
