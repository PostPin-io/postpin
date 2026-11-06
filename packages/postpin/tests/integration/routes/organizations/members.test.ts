import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	cancelInvitation,
	changeInvitationRole,
	changeMemberRole,
	getInviteLinks,
	getOrg,
	getTargetInvitations,
	inviteMember,
	removeMember,
	resendInvitation,
	resetInviteLink,
	setInviteLinkEnabled,
} from "../../../../src/routes/(root)/organizations/[organization]/members/members.remote.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { fakes } from "../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

/**
 * One org with an owner, an admin, a member and a reviewer. Member and reviewer
 * are granted project A; project B has a member of its own. A second org exists
 * to test isolation.
 */
async function world() {
	const org = await f.createOrg();
	const other = await f.createOrg();

	const owner = await f.createMember(org, OWNER);
	const admin = await f.createMember(org, ADMIN);
	const member = await f.createMember(org, MEMBER);
	const reviewer = await f.createMember(org, REVIEWER);
	const memberB = await f.createMember(org, MEMBER);

	const projectA = await f.createProject(org);
	const projectB = await f.createProject(org);
	const tlA = await f.createTimeline(projectA);
	const tlB = await f.createTimeline(projectB);

	await f.grant(member, { projectId: projectA.id });
	await f.grant(reviewer, { projectId: projectA.id });
	await f.grant(memberB, { projectId: projectB.id });

	const otherOwner = await f.createMember(other, OWNER);
	const otherMember = await f.createMember(other, MEMBER);
	const otherProject = await f.createProject(other);

	return {
		org,
		other,
		owner,
		admin,
		member,
		reviewer,
		memberB,
		projectA,
		projectB,
		tlA,
		tlB,
		otherOwner,
		otherMember,
		otherProject,
	};
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

const as = (m: { user: { id: string; email: string; name: string } }, orgId = w.org.id) =>
	signIn(m.user, orgId);

const orgTarget = () => ({ type: "organization" as const, id: w.org.id });
const projectA = () => ({ type: "project" as const, id: w.projectA.id });
const projectB = () => ({ type: "project" as const, id: w.projectB.id });

const findInvitation = (id: string) => prisma.invitation.findUniqueOrThrow({ where: { id } });

// ─── getOrg ─────────────────────────────────────────────────────────────────

describe("getOrg", () => {
	it("404 for an unknown slug", async () => {
		as(w.owner);
		await expectStatus(getOrg("no-such-org"), 404);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(getOrg(w.org.slug), 401);
	});

	it("404 for a user of another org", async () => {
		as(w.otherOwner, w.other.id);
		await expectStatus(getOrg(w.org.slug), 404);
	});

	it("owner sees every member and every pending invitation", async () => {
		await f.createInvitation(w.org);
		await f.createInvitation(w.org, { projectId: w.projectB.id });
		const accepted = await f.createInvitation(w.org);
		await prisma.invitation.update({ where: { id: accepted.id }, data: { status: "accepted" } });

		as(w.owner);
		const res = await getOrg(w.org.slug);

		expect(res.myRole).toBe(OWNER);
		expect(res.myMemberId).toBe(w.owner.id);
		expect(res.members).toHaveLength(5);
		expect(res.invitations).toHaveLength(2);
		expect(res.canInviteToOrg).toBe(true);
		expect(res.canManageInviteLinks).toBe(true);
		expect(res.inviteRoles).toEqual([ADMIN, MEMBER, REVIEWER]);
	});

	it("member sees self, managers and colleagues in their projects only", async () => {
		as(w.member);
		const res = await getOrg(w.org.slug);

		const ids = res.members.map((m) => m.id).sort();
		expect(ids).toEqual([w.owner.id, w.admin.id, w.member.id, w.reviewer.id].sort());
		expect(res.canInviteToOrg).toBe(false);
		expect(res.canManageInviteLinks).toBe(false);
		expect(res.inviteRoles).toEqual([MEMBER, REVIEWER]);
	});

	it("reviewer without grants sees only self and managers", async () => {
		const lonely = await f.createMember(w.org, REVIEWER);
		as(lonely);
		const res = await getOrg(w.org.slug);
		const ids = res.members.map((m) => m.id).sort();
		expect(ids).toEqual([w.owner.id, w.admin.id, lonely.id].sort());
	});

	it("member sees only invitations inside their projects, never org-level ones", async () => {
		await f.createInvitation(w.org); // org-level
		const inA = await f.createInvitation(w.org, {
			projectId: w.projectA.id,
			inviter: w.member.user,
		});
		const inTlA = await f.createInvitation(w.org, { timelineId: w.tlA.id, inviter: w.admin.user });
		await f.createInvitation(w.org, { projectId: w.projectB.id });

		as(w.member);
		const res = await getOrg(w.org.slug);

		expect(res.invitations.map((i) => i.id).sort()).toEqual([inA.id, inTlA.id].sort());
		const own = res.invitations.find((i) => i.id === inA.id)!;
		const others = res.invitations.find((i) => i.id === inTlA.id)!;
		expect(own).toMatchObject({ canUpdate: true, canDelete: true, canResend: true });
		expect(others).toMatchObject({ canUpdate: false, canDelete: false, canResend: false });
	});

	it("reviewer sees no invitations", async () => {
		await f.createInvitation(w.org, { projectId: w.projectA.id });
		as(w.reviewer);
		const res = await getOrg(w.org.slug);
		expect(res.canSeeInvitations).toBe(false);
		expect(res.invitations).toEqual([]);
	});

	it("protects the last owner: no demotion, no removal", async () => {
		as(w.owner);
		const res = await getOrg(w.org.slug);
		const self = res.members.find((m) => m.id === w.owner.id)!;
		expect(self.assignableRoles).toEqual([OWNER]);
		expect(self.canRemove).toBe(false);
	});

	it("admin may assign up to admin and cannot touch owners", async () => {
		as(w.admin);
		const res = await getOrg(w.org.slug);
		const member = res.members.find((m) => m.id === w.member.id)!;
		const owner = res.members.find((m) => m.id === w.owner.id)!;
		expect(member.assignableRoles).toEqual([ADMIN, MEMBER, REVIEWER]);
		expect(member.canRemove).toBe(true);
		expect(owner.assignableRoles).toEqual([]);
		expect(owner.canRemove).toBe(false);
		expect(owner.canViewGrants).toBe(false);
		expect(member.canViewGrants).toBe(true);
	});

	it("member cannot change roles or remove anyone", async () => {
		as(w.member);
		const res = await getOrg(w.org.slug);
		for (const m of res.members) {
			expect(m.assignableRoles).toEqual([]);
			expect(m.canRemove).toBe(false);
		}
	});
});

// ─── inviteMember ───────────────────────────────────────────────────────────

describe("inviteMember", () => {
	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(inviteMember({ email: "a@b.de", role: MEMBER, target: orgTarget() }), 401);
	});

	it("owner invites to the org: row created and e-mail sent", async () => {
		as(w.owner);
		await inviteMember({ email: "new@test.local", role: ADMIN, target: orgTarget() });

		const inv = await prisma.invitation.findFirstOrThrow({ where: { email: "new@test.local" } });
		expect(inv).toMatchObject({
			organizationId: w.org.id,
			role: ADMIN,
			status: "pending",
			projectId: null,
			timelineId: null,
			inviterId: w.owner.user.id,
		});
		expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);

		expect(fakes.emails).toHaveLength(1);
		expect(fakes.emails[0].to).toBe("new@test.local");
		expect(fakes.emails[0].subject).toContain(w.org.name);
		expect(fakes.emails[0].text).toContain(`/auth/invite/${inv.id}`);
		expect(fakes.emails[0].text).toContain(w.owner.user.name);
	});

	it("normalises the e-mail address", async () => {
		as(w.owner);
		await inviteMember({ email: "  New@Test.LOCAL ", role: MEMBER, target: orgTarget() });
		expect(await prisma.invitation.count({ where: { email: "new@test.local" } })).toBe(1);
	});

	it("400 for an invalid e-mail address", async () => {
		as(w.owner);
		await expectStatus(inviteMember({ email: "nope", role: MEMBER, target: orgTarget() }), 400);
	});

	it("400 when inviting as owner, even for an owner", async () => {
		as(w.owner);
		await expectStatus(
			inviteMember({ email: "x@test.local", role: OWNER as never, target: orgTarget() }),
			400,
		);
		expect(await prisma.invitation.count()).toBe(0);
	});

	it("admin may invite admins", async () => {
		as(w.admin);
		await inviteMember({ email: "x@test.local", role: ADMIN, target: orgTarget() });
		expect(await prisma.invitation.count({ where: { role: ADMIN } })).toBe(1);
	});

	it("member cannot invite to the org itself", async () => {
		as(w.member);
		await expectStatus(
			inviteMember({ email: "x@test.local", role: MEMBER, target: orgTarget() }),
			403,
		);
	});

	it("member invites to a granted project", async () => {
		as(w.member);
		await inviteMember({ email: "x@test.local", role: REVIEWER, target: projectA() });
		const inv = await prisma.invitation.findFirstOrThrow({ where: { email: "x@test.local" } });
		expect(inv).toMatchObject({ projectId: w.projectA.id, timelineId: null, role: REVIEWER });
		expect(fakes.emails).toHaveLength(1);
	});

	it("member invites to a timeline inside a granted project", async () => {
		as(w.member);
		await inviteMember({
			email: "x@test.local",
			role: MEMBER,
			target: { type: "timeline", id: w.tlA.id },
		});
		const inv = await prisma.invitation.findFirstOrThrow({ where: { email: "x@test.local" } });
		expect(inv).toMatchObject({ projectId: null, timelineId: w.tlA.id });
	});

	it("member cannot invite above their role", async () => {
		as(w.member);
		await expectStatus(
			inviteMember({ email: "x@test.local", role: ADMIN, target: projectA() }),
			403,
		);
		expect(await prisma.invitation.count()).toBe(0);
	});

	it("member cannot invite to a project without a grant", async () => {
		as(w.member);
		await expectStatus(
			inviteMember({ email: "x@test.local", role: MEMBER, target: projectB() }),
			404,
		);
	});

	it("reviewer cannot invite at all", async () => {
		as(w.reviewer);
		await expectStatus(
			inviteMember({ email: "x@test.local", role: REVIEWER, target: projectA() }),
			403,
		);
	});

	it("404 for a project of another org", async () => {
		as(w.owner);
		await expectStatus(
			inviteMember({
				email: "x@test.local",
				role: MEMBER,
				target: { type: "project", id: w.otherProject.id },
			}),
			404,
		);
		expect(await prisma.invitation.count()).toBe(0);
	});

	it("409 when the address already belongs to a member", async () => {
		as(w.owner);
		await expectStatus(
			inviteMember({ email: w.member.user.email, role: MEMBER, target: projectA() }),
			409,
		);
		expect(fakes.emails).toHaveLength(0);
	});

	it("a member of another org can still be invited", async () => {
		as(w.owner);
		await inviteMember({ email: w.otherMember.user.email, role: MEMBER, target: orgTarget() });
		expect(await prisma.invitation.count()).toBe(1);
	});

	it("inviting the same address to the same target refreshes the pending invitation", async () => {
		as(w.owner);
		const old = await f.createInvitation(w.org, { email: "x@test.local", role: REVIEWER });
		await prisma.invitation.update({
			where: { id: old.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});

		await inviteMember({ email: "x@test.local", role: MEMBER, target: orgTarget() });

		expect(await prisma.invitation.count()).toBe(1);
		const inv = await findInvitation(old.id);
		expect(inv.role).toBe(MEMBER);
		expect(inv.inviterId).toBe(w.owner.user.id);
		expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(fakes.emails).toHaveLength(1);
	});

	it("a different target creates a second invitation", async () => {
		as(w.owner);
		await inviteMember({ email: "x@test.local", role: MEMBER, target: projectA() });
		await inviteMember({ email: "x@test.local", role: MEMBER, target: projectB() });
		expect(await prisma.invitation.count()).toBe(2);
	});

	it("member re-inviting cannot take over an invitation someone else sent", async () => {
		const adminInv = await f.createInvitation(w.org, {
			email: "x@test.local",
			role: REVIEWER,
			inviter: w.admin.user,
			projectId: w.projectA.id,
		});

		as(w.member);
		await inviteMember({ email: "x@test.local", role: MEMBER, target: projectA() }).catch(() => {});

		const after = await findInvitation(adminInv.id);
		expect(after.role).toBe(REVIEWER);
		expect(after.inviterId).toBe(w.admin.user.id);
	});
});

// ─── changeInvitationRole ───────────────────────────────────────────────────

describe("changeInvitationRole", () => {
	it("admin changes the role of any pending invitation", async () => {
		const inv = await f.createInvitation(w.org, { inviter: w.owner.user });
		as(w.admin);
		await changeInvitationRole({ invitationId: inv.id, role: ADMIN });
		expect((await findInvitation(inv.id)).role).toBe(ADMIN);
	});

	it("member changes their own invitation within their role", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
			role: REVIEWER,
		});
		as(w.member);
		await changeInvitationRole({ invitationId: inv.id, role: MEMBER });
		expect((await findInvitation(inv.id)).role).toBe(MEMBER);
	});

	it("member cannot raise their own invitation to admin", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: ADMIN }), 403);
		expect((await findInvitation(inv.id)).role).toBe(MEMBER);
	});

	it("member cannot change someone else's invitation", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.admin.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: REVIEWER }), 403);
	});

	it("member cannot lower an admin invitation they somehow own", async () => {
		// e.g. they were demoted after sending it
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
			role: ADMIN,
		});
		as(w.member);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: MEMBER }), 403);
	});

	it("reviewer gets 404", async () => {
		const inv = await f.createInvitation(w.org, { projectId: w.projectA.id });
		as(w.reviewer);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: REVIEWER }), 404);
	});

	it("400 for owner as the new role", async () => {
		const inv = await f.createInvitation(w.org);
		as(w.owner);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: OWNER as never }), 400);
	});

	it("400 when the invitation is not pending", async () => {
		const inv = await f.createInvitation(w.org);
		await prisma.invitation.update({ where: { id: inv.id }, data: { status: "accepted" } });
		as(w.owner);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: ADMIN }), 400);
	});

	it("400 when the invitation has expired", async () => {
		const inv = await f.createInvitation(w.org);
		await prisma.invitation.update({
			where: { id: inv.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		as(w.owner);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: ADMIN }), 400);
	});

	it("404 for an invitation of another org", async () => {
		const inv = await f.createInvitation(w.other);
		as(w.owner);
		await expectStatus(changeInvitationRole({ invitationId: inv.id, role: ADMIN }), 404);
		expect((await findInvitation(inv.id)).role).toBe(MEMBER);
	});

	it("404 for an unknown invitation", async () => {
		as(w.owner);
		await expectStatus(changeInvitationRole({ invitationId: "nope", role: ADMIN }), 404);
	});
});

// ─── cancelInvitation ───────────────────────────────────────────────────────

describe("cancelInvitation", () => {
	it("member cancels their own invitation", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await cancelInvitation(inv.id);
		expect((await findInvitation(inv.id)).status).toBe("canceled");
	});

	it("member cannot cancel someone else's invitation", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.admin.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(cancelInvitation(inv.id), 403);
		expect((await findInvitation(inv.id)).status).toBe("pending");
	});

	it("member cannot cancel their own invitation in a project they lost access to", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectB.id,
		});
		as(w.member);
		await expectStatus(cancelInvitation(inv.id), 404);
	});

	it("admin cancels any invitation", async () => {
		const inv = await f.createInvitation(w.org, { inviter: w.owner.user });
		as(w.admin);
		await cancelInvitation(inv.id);
		expect((await findInvitation(inv.id)).status).toBe("canceled");
	});

	it("400 when it is not pending anymore", async () => {
		const inv = await f.createInvitation(w.org);
		await prisma.invitation.update({ where: { id: inv.id }, data: { status: "accepted" } });
		as(w.owner);
		await expectStatus(cancelInvitation(inv.id), 400);
		expect((await findInvitation(inv.id)).status).toBe("accepted");
	});

	it("404 for an invitation of another org", async () => {
		const inv = await f.createInvitation(w.other);
		as(w.owner);
		await expectStatus(cancelInvitation(inv.id), 404);
		expect((await findInvitation(inv.id)).status).toBe("pending");
	});
});

// ─── resendInvitation ───────────────────────────────────────────────────────

describe("resendInvitation", () => {
	it("restarts the expiry, also for expired invitations, and sends the e-mail again", async () => {
		const inv = await f.createInvitation(w.org, { email: "x@test.local" });
		await prisma.invitation.update({
			where: { id: inv.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		as(w.admin);
		await resendInvitation(inv.id);

		expect((await findInvitation(inv.id)).expiresAt.getTime()).toBeGreaterThan(
			Date.now() + 47 * 3600_000,
		);
		expect(fakes.emails).toHaveLength(1);
		expect(fakes.emails[0]).toMatchObject({ to: "x@test.local" });
		expect(fakes.emails[0].text).toContain(`/auth/invite/${inv.id}`);
		expect(fakes.emails[0].text).toContain(w.admin.user.name);
	});

	it("member resends their own invitation", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await resendInvitation(inv.id);
		expect(fakes.emails).toHaveLength(1);
	});

	it("member cannot resend someone else's invitation", async () => {
		const inv = await f.createInvitation(w.org, {
			inviter: w.admin.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(resendInvitation(inv.id), 403);
		expect(fakes.emails).toHaveLength(0);
	});

	it("400 when it is not pending", async () => {
		const inv = await f.createInvitation(w.org);
		await prisma.invitation.update({ where: { id: inv.id }, data: { status: "canceled" } });
		as(w.owner);
		await expectStatus(resendInvitation(inv.id), 400);
		expect(fakes.emails).toHaveLength(0);
	});

	it("404 for an invitation of another org", async () => {
		const inv = await f.createInvitation(w.other);
		as(w.owner);
		await expectStatus(resendInvitation(inv.id), 404);
		expect(fakes.emails).toHaveLength(0);
	});
});

// ─── getTargetInvitations ───────────────────────────────────────────────────

describe("getTargetInvitations", () => {
	it("lists pending invitations of exactly that target, with own-only flags", async () => {
		const own = await f.createInvitation(w.org, {
			inviter: w.member.user,
			projectId: w.projectA.id,
		});
		const others = await f.createInvitation(w.org, {
			inviter: w.admin.user,
			projectId: w.projectA.id,
		});
		const done = await f.createInvitation(w.org, { projectId: w.projectA.id });
		await prisma.invitation.update({ where: { id: done.id }, data: { status: "accepted" } });
		await f.createInvitation(w.org, { timelineId: w.tlA.id }); // other target
		await f.createInvitation(w.org); // org-level

		as(w.member);
		const res = await getTargetInvitations(projectA());

		expect(res.map((i) => i.id).sort()).toEqual([own.id, others.id].sort());
		expect(res.find((i) => i.id === own.id)).toMatchObject({ canDelete: true, canResend: true });
		expect(res.find((i) => i.id === others.id)).toMatchObject({
			canDelete: false,
			canResend: false,
		});
		expect(res[0]).not.toHaveProperty("inviterId");
	});

	it("member cannot list org-level invitations", async () => {
		as(w.member);
		await expectStatus(getTargetInvitations(orgTarget()), 403);
	});

	it("reviewer cannot list invitations", async () => {
		as(w.reviewer);
		await expectStatus(getTargetInvitations(projectA()), 403);
	});

	it("404 for a target in another org", async () => {
		as(w.owner);
		await expectStatus(getTargetInvitations({ type: "organization", id: w.other.id }), 404);
	});
});

// ─── invite links ───────────────────────────────────────────────────────────

describe("getInviteLinks", () => {
	it("admin sees a slot per invite role on the org", async () => {
		as(w.admin);
		const res = await getInviteLinks(orgTarget());
		expect(res.map((l) => l.role)).toEqual([ADMIN, MEMBER, REVIEWER]);
		expect(res.every((l) => l.token === null && !l.enabled && l.canManage)).toBe(true);
	});

	it("member cannot see org-level links", async () => {
		as(w.member);
		await expectStatus(getInviteLinks(orgTarget()), 403);
	});

	it("member sees only roles up to their own, and links of others are read-only", async () => {
		const link = await f.createInviteLink(w.org, {
			role: REVIEWER,
			createdBy: w.admin.user,
			projectId: w.projectA.id,
		});
		await f.createInviteLink(w.org, { role: MEMBER, projectId: w.projectB.id }); // other target

		as(w.member);
		const res = await getInviteLinks(projectA());

		expect(res.map((l) => l.role)).toEqual([MEMBER, REVIEWER]);
		expect(res[0]).toEqual({ role: MEMBER, token: null, enabled: false, canManage: true });
		expect(res[1]).toEqual({ role: REVIEWER, token: link.token, enabled: true, canManage: false });
	});

	it("reviewer cannot see links", async () => {
		as(w.reviewer);
		await expectStatus(getInviteLinks(projectA()), 403);
	});

	it("404 for another org", async () => {
		as(w.owner);
		await expectStatus(getInviteLinks({ type: "organization", id: w.other.id }), 404);
	});
});

describe("setInviteLinkEnabled", () => {
	it("enabling creates a link with a fresh token", async () => {
		as(w.member);
		await setInviteLinkEnabled({ target: projectA(), role: MEMBER, enabled: true });

		const link = await prisma.inviteLink.findFirstOrThrow();
		expect(link).toMatchObject({
			organizationId: w.org.id,
			role: MEMBER,
			enabled: true,
			projectId: w.projectA.id,
			timelineId: null,
			createdById: w.member.user.id,
		});
		expect(link.token.length).toBeGreaterThanOrEqual(32);
	});

	it("disabling and re-enabling keeps the token", async () => {
		as(w.owner);
		await setInviteLinkEnabled({ target: orgTarget(), role: ADMIN, enabled: true });
		const { token } = await prisma.inviteLink.findFirstOrThrow();

		await setInviteLinkEnabled({ target: orgTarget(), role: ADMIN, enabled: false });
		expect((await prisma.inviteLink.findFirstOrThrow()).enabled).toBe(false);

		await setInviteLinkEnabled({ target: orgTarget(), role: ADMIN, enabled: true });
		const link = await prisma.inviteLink.findFirstOrThrow();
		expect(link).toMatchObject({ enabled: true, token });
		expect(await prisma.inviteLink.count()).toBe(1);
	});

	it("disabling a link that doesn't exist creates nothing", async () => {
		as(w.owner);
		await setInviteLinkEnabled({ target: orgTarget(), role: MEMBER, enabled: false });
		expect(await prisma.inviteLink.count()).toBe(0);
	});

	it("member cannot create a link above their role", async () => {
		as(w.member);
		await expectStatus(
			setInviteLinkEnabled({ target: projectA(), role: ADMIN, enabled: true }),
			403,
		);
		expect(await prisma.inviteLink.count()).toBe(0);
	});

	it("400 for owner links", async () => {
		as(w.owner);
		await expectStatus(
			setInviteLinkEnabled({ target: orgTarget(), role: OWNER as never, enabled: true }),
			400,
		);
	});

	it("member cannot disable a link someone else created", async () => {
		await f.createInviteLink(w.org, {
			role: MEMBER,
			createdBy: w.admin.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(
			setInviteLinkEnabled({ target: projectA(), role: MEMBER, enabled: false }),
			403,
		);
		expect((await prisma.inviteLink.findFirstOrThrow()).enabled).toBe(true);
	});

	it("admin disables a link someone else created", async () => {
		await f.createInviteLink(w.org, {
			role: MEMBER,
			createdBy: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.admin);
		await setInviteLinkEnabled({ target: projectA(), role: MEMBER, enabled: false });
		expect((await prisma.inviteLink.findFirstOrThrow()).enabled).toBe(false);
	});

	it("member cannot create org-level links", async () => {
		as(w.member);
		await expectStatus(
			setInviteLinkEnabled({ target: orgTarget(), role: REVIEWER, enabled: true }),
			403,
		);
	});

	it("404 for a project of another org", async () => {
		as(w.owner);
		await expectStatus(
			setInviteLinkEnabled({
				target: { type: "project", id: w.otherProject.id },
				role: MEMBER,
				enabled: true,
			}),
			404,
		);
		expect(await prisma.inviteLink.count()).toBe(0);
	});
});

describe("resetInviteLink", () => {
	it("replaces the token", async () => {
		const link = await f.createInviteLink(w.org, {
			role: MEMBER,
			createdBy: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await resetInviteLink({ target: projectA(), role: MEMBER });
		const after = await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } });
		expect(after.token).not.toBe(link.token);
	});

	it("404 when there is no link", async () => {
		as(w.owner);
		await expectStatus(resetInviteLink({ target: orgTarget(), role: MEMBER }), 404);
	});

	it("member cannot reset someone else's link", async () => {
		const link = await f.createInviteLink(w.org, {
			role: MEMBER,
			createdBy: w.admin.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(resetInviteLink({ target: projectA(), role: MEMBER }), 403);
		expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).token).toBe(
			link.token,
		);
	});

	it("member cannot reset a link above their role", async () => {
		await f.createInviteLink(w.org, {
			role: ADMIN,
			createdBy: w.member.user,
			projectId: w.projectA.id,
		});
		as(w.member);
		await expectStatus(resetInviteLink({ target: projectA(), role: ADMIN }), 403);
	});

	it("does not touch a link of another org", async () => {
		const link = await f.createInviteLink(w.other, { role: MEMBER });
		as(w.owner);
		await expectStatus(
			resetInviteLink({ target: { type: "organization", id: w.other.id }, role: MEMBER }),
			404,
		);
		expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).token).toBe(
			link.token,
		);
	});
});

// ─── changeMemberRole ───────────────────────────────────────────────────────

describe("changeMemberRole", () => {
	const roleOf = async (id: string) =>
		(await prisma.member.findUniqueOrThrow({ where: { id } })).role;

	it("owner promotes a member to owner", async () => {
		as(w.owner);
		await changeMemberRole({ memberId: w.member.id, role: OWNER });
		expect(await roleOf(w.member.id)).toBe(OWNER);
	});

	it("admin promotes a member to admin and demotes another admin", async () => {
		const admin2 = await f.createMember(w.org, ADMIN);
		as(w.admin);
		await changeMemberRole({ memberId: w.member.id, role: ADMIN });
		await changeMemberRole({ memberId: admin2.id, role: REVIEWER });
		expect(await roleOf(w.member.id)).toBe(ADMIN);
		expect(await roleOf(admin2.id)).toBe(REVIEWER);
	});

	it("admin cannot promote to owner", async () => {
		as(w.admin);
		await expectStatus(changeMemberRole({ memberId: w.member.id, role: OWNER }), 403);
		expect(await roleOf(w.member.id)).toBe(MEMBER);
	});

	it("admin cannot promote themselves to owner", async () => {
		as(w.admin);
		await expectStatus(changeMemberRole({ memberId: w.admin.id, role: OWNER }), 403);
	});

	it("admin cannot change an owner", async () => {
		const owner2 = await f.createMember(w.org, OWNER);
		as(w.admin);
		await expectStatus(changeMemberRole({ memberId: owner2.id, role: MEMBER }), 403);
		expect(await roleOf(owner2.id)).toBe(OWNER);
	});

	it("the last owner cannot demote themselves", async () => {
		as(w.owner);
		await expectStatus(changeMemberRole({ memberId: w.owner.id, role: ADMIN }), 403);
		expect(await roleOf(w.owner.id)).toBe(OWNER);
	});

	it("an owner can step down when another owner exists", async () => {
		await f.createMember(w.org, OWNER);
		as(w.owner);
		await changeMemberRole({ memberId: w.owner.id, role: ADMIN });
		expect(await roleOf(w.owner.id)).toBe(ADMIN);
	});

	it("member cannot change roles", async () => {
		as(w.member);
		await expectStatus(changeMemberRole({ memberId: w.reviewer.id, role: MEMBER }), 404);
		expect(await roleOf(w.reviewer.id)).toBe(REVIEWER);
	});

	it("reviewer cannot change their own role", async () => {
		as(w.reviewer);
		await expectStatus(changeMemberRole({ memberId: w.reviewer.id, role: MEMBER }), 404);
	});

	it("404 for a member of another org", async () => {
		as(w.owner);
		await expectStatus(changeMemberRole({ memberId: w.otherMember.id, role: ADMIN }), 404);
		expect(await roleOf(w.otherMember.id)).toBe(MEMBER);
	});

	it("400 for an unknown role", async () => {
		as(w.owner);
		await expectStatus(changeMemberRole({ memberId: w.member.id, role: "member" as never }), 400);
	});
});

// ─── removeMember ───────────────────────────────────────────────────────────

describe("removeMember", () => {
	it("admin removes a member: membership, grants and active-org pointers are gone", async () => {
		const otherOrgSession = await prisma.session.create({
			data: {
				id: "s-other",
				token: "t-other",
				userId: w.member.user.id,
				activeOrganizationId: w.other.id,
				expiresAt: new Date(Date.now() + 3600_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const session = await prisma.session.create({
			data: {
				id: "s-org",
				token: "t-org",
				userId: w.member.user.id,
				activeOrganizationId: w.org.id,
				expiresAt: new Date(Date.now() + 3600_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await prisma.user.update({
			where: { id: w.member.user.id },
			data: { lastActiveOrganizationId: w.org.id },
		});

		as(w.admin);
		await removeMember(w.member.id);

		expect(await prisma.member.findUnique({ where: { id: w.member.id } })).toBeNull();
		expect(await prisma.memberGrant.count({ where: { memberId: w.member.id } })).toBe(0);
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeOrganizationId,
		).toBeNull();
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: otherOrgSession.id } }))
				.activeOrganizationId,
		).toBe(w.other.id);
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: w.member.user.id } }))
				.lastActiveOrganizationId,
		).toBeNull();
		// the user account itself stays
		expect(await prisma.user.count({ where: { id: w.member.user.id } })).toBe(1);
	});

	it("400 when removing yourself", async () => {
		as(w.admin);
		await expectStatus(removeMember(w.admin.id), 400);
		expect(await prisma.member.count({ where: { id: w.admin.id } })).toBe(1);
	});

	it("admin cannot remove an owner", async () => {
		as(w.admin);
		await expectStatus(removeMember(w.owner.id), 403);
		expect(await prisma.member.count({ where: { id: w.owner.id } })).toBe(1);
	});

	it("owner removes another owner", async () => {
		const owner2 = await f.createMember(w.org, OWNER);
		as(w.owner);
		await removeMember(owner2.id);
		expect(await prisma.member.count({ where: { id: owner2.id } })).toBe(0);
	});

	it("member cannot remove anyone", async () => {
		as(w.member);
		await expectStatus(removeMember(w.reviewer.id), 404);
		expect(await prisma.member.count({ where: { id: w.reviewer.id } })).toBe(1);
	});

	it("404 for a member of another org", async () => {
		as(w.owner);
		await expectStatus(removeMember(w.otherMember.id), 404);
		expect(await prisma.member.count({ where: { id: w.otherMember.id } })).toBe(1);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(removeMember(w.member.id), 401);
	});
});
