import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { auth } from "#lib/server/auth.ts";
import {
	getInviteLinkInfo,
	joinViaLink,
} from "../../../../src/routes/auth/join/[token]/join.remote.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let setActive: ReturnType<typeof vi.spyOn>;

async function world() {
	const org = await f.createOrg({ name: "Acme" });
	const other = await f.createOrg();
	const owner = await f.createMember(org, OWNER);
	const project = await f.createProject(org);
	const timeline = await f.createTimeline(project);
	const visitor = await f.createUser();
	return { org, other, owner, project, timeline, visitor };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
	setActive = vi.spyOn(auth.api, "setActiveOrganization").mockResolvedValue(null as never);
	return () => setActive.mockRestore();
});

/** locals.user carries the user's memberships (see app.d.ts) */
async function signInWithMemberships(user: { id: string }) {
	const full = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: { memberships: true },
	});
	signIn(full);
}

const membershipOf = (userId: string, organizationId = w.org.id) =>
	prisma.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		include: { memberGrants: true },
	});

// ─── getInviteLinkInfo ──────────────────────────────────────────────────────

describe("getInviteLinkInfo", () => {
	it("public: shows org and role of an enabled link", async () => {
		const link = await f.createInviteLink(w.org, { role: REVIEWER });
		signOut();
		expect(await getInviteLinkInfo(link.token)).toMatchObject({
			valid: true,
			organizationName: "Acme",
			targetName: null,
			role: REVIEWER,
			signedIn: false,
			alreadyMember: false,
		});
	});

	it("names the project or timeline of a targeted link", async () => {
		const p = await prisma.project.update({ where: { id: w.project.id }, data: { name: "Alpha" } });
		const t = await prisma.timeline.update({
			where: { id: w.timeline.id },
			data: { name: "Cut 1" },
		});
		const pLink = await f.createInviteLink(w.org, { projectId: p.id });
		const tLink = await f.createInviteLink(w.org, { role: REVIEWER, timelineId: t.id });
		expect((await getInviteLinkInfo(pLink.token)).targetName).toBe("Alpha");
		expect((await getInviteLinkInfo(tLink.token)).targetName).toBe("Alpha / Cut 1");
	});

	it("reveals nothing for a disabled link", async () => {
		const link = await f.createInviteLink(w.org);
		await prisma.inviteLink.update({ where: { id: link.id }, data: { enabled: false } });
		expect(await getInviteLinkInfo(link.token)).toMatchObject({
			valid: false,
			organizationName: null,
			targetName: null,
			role: null,
		});
	});

	it("unknown token → invalid", async () => {
		expect((await getInviteLinkInfo("nope")).valid).toBe(false);
	});

	it("tells a signed-in member that they are already in", async () => {
		const link = await f.createInviteLink(w.org);
		await signInWithMemberships(w.owner.user);
		expect(await getInviteLinkInfo(link.token)).toMatchObject({
			signedIn: true,
			alreadyMember: true,
		});
	});

	it("membership in another org doesn't count", async () => {
		await f.createMember(w.other, MEMBER, w.visitor);
		const link = await f.createInviteLink(w.org);
		await signInWithMemberships(w.visitor);
		expect(await getInviteLinkInfo(link.token)).toMatchObject({
			signedIn: true,
			alreadyMember: false,
		});
	});
});

// ─── joinViaLink ────────────────────────────────────────────────────────────

describe("joinViaLink", () => {
	it("401 when not signed in", async () => {
		const link = await f.createInviteLink(w.org);
		signOut();
		await expectStatus(joinViaLink(link.token), 401);
	});

	it("404 for a disabled or unknown link", async () => {
		const link = await f.createInviteLink(w.org);
		await prisma.inviteLink.update({ where: { id: link.id }, data: { enabled: false } });
		await signInWithMemberships(w.visitor);
		await expectStatus(joinViaLink(link.token), 404);
		await expectStatus(joinViaLink("nope"), 404);
		expect(await membershipOf(w.visitor.id)).toBeNull();
		expect(setActive).not.toHaveBeenCalled();
	});

	it("org link: joins with the link's role and sets the active org", async () => {
		const link = await f.createInviteLink(w.org, { role: ADMIN });
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);

		expect(await membershipOf(w.visitor.id)).toMatchObject({ role: ADMIN, memberGrants: [] });
		expect(setActive).toHaveBeenCalledOnce();
		expect(setActive.mock.calls[0][0]).toMatchObject({ body: { organizationId: w.org.id } });
	});

	it("project link: joins and gets a project grant from the link's creator", async () => {
		const link = await f.createInviteLink(w.org, {
			role: REVIEWER,
			projectId: w.project.id,
			createdBy: w.owner.user,
		});
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);

		const m = await membershipOf(w.visitor.id);
		expect(m!.role).toBe(REVIEWER);
		expect(m!.memberGrants).toMatchObject([
			{ projectId: w.project.id, createdById: w.owner.user.id },
		]);
	});

	it("timeline link: joins and gets a timeline grant", async () => {
		const link = await f.createInviteLink(w.org, { timelineId: w.timeline.id });
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);
		expect((await membershipOf(w.visitor.id))!.memberGrants).toMatchObject([
			{ timelineId: w.timeline.id },
		]);
	});

	it("the link stays usable for more people", async () => {
		const link = await f.createInviteLink(w.org);
		const second = await f.createUser();
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);
		await signInWithMemberships(second);
		await joinViaLink(link.token);
		expect(await prisma.member.count({ where: { organizationId: w.org.id } })).toBe(3);
	});

	it("an existing member keeps their role but gets the grant; joining twice is harmless", async () => {
		const existing = await f.createMember(w.org, MEMBER, w.visitor);
		const link = await f.createInviteLink(w.org, { role: REVIEWER, projectId: w.project.id });
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);
		await joinViaLink(link.token);

		const m = await membershipOf(w.visitor.id);
		expect(m!.id).toBe(existing.id);
		expect(m!.role).toBe(MEMBER);
		expect(m!.memberGrants).toHaveLength(1);
	});

	it("an existing reviewer is not promoted by an admin link", async () => {
		await f.createMember(w.org, REVIEWER, w.visitor);
		const link = await f.createInviteLink(w.org, { role: ADMIN });
		await signInWithMemberships(w.visitor);
		await joinViaLink(link.token);
		expect((await membershipOf(w.visitor.id))!.role).toBe(REVIEWER);
	});

	it("an existing owner is not demoted by a reviewer link and gets no grant", async () => {
		const link = await f.createInviteLink(w.org, { role: REVIEWER, projectId: w.project.id });
		await signInWithMemberships(w.owner.user);
		await joinViaLink(link.token);
		expect(await membershipOf(w.owner.user.id)).toMatchObject({ role: OWNER, memberGrants: [] });
	});
});
