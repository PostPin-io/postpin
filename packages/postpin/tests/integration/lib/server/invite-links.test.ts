import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { auth } from "#lib/server/auth.ts";
import { removeGrant } from "#lib/components/sharing/grants.remote.ts";
import {
	changeMemberRole,
	removeMember,
	setInviteLinkEnabled,
} from "../../../../src/routes/(root)/organizations/[organization]/settings/members/members.remote.ts";
import { leaveOrganization } from "../../../../src/routes/(root)/profile/profile.remote.ts";
import {
	getInviteLinkInfo,
	joinViaLink,
} from "../../../../src/routes/auth/join/[token]/join.remote.ts";
import {
	acceptInvitation,
	getInvitationPreview,
} from "../../../../src/routes/auth/invite/[id]/invite.remote.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { signIn } from "../../../helpers/request-event.ts";

/**
 * What a member handed out (invite links, pending e-mail invitations) stops working once they may
 * no longer hand it out: removed, left, demoted, lost the grant, or their account is gone.
 */

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

async function world() {
	const org = await f.createOrg();
	const other = await f.createOrg();
	const owner = await f.createMember(org, OWNER);
	const p1 = await f.createProject(org);
	const p2 = await f.createProject(org);
	const t1 = await f.createTimeline(p1);
	const t2 = await f.createTimeline(p2);
	return { org, other, owner, p1, p2, t1, t2 };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
	const spy = vi.spyOn(auth.api, "setActiveOrganization").mockResolvedValue(null as never);
	return () => spy.mockRestore();
});

const linkState = (id: string) =>
	prisma.inviteLink.findUniqueOrThrow({ where: { id }, select: { enabled: true, token: true } });
const invitationStatus = async (id: string) =>
	(await prisma.invitation.findUniqueOrThrow({ where: { id } })).status;

/** A member who handed out a link and an invitation per role they may hand out */
async function handedOut(member: Awaited<ReturnType<typeof f.createMember>>, target = {}) {
	const roles = [ADMIN, MEMBER, REVIEWER].filter(
		(r) => member.role === OWNER || member.role === ADMIN || r !== ADMIN,
	);
	const links = Object.fromEntries(
		await Promise.all(
			roles.map(async (role) => [
				role,
				await f.createInviteLink(w.org, { role, createdBy: member.user, ...target }),
			]),
		),
	);
	const invitations = Object.fromEntries(
		await Promise.all(
			roles.map(async (role) => [
				role,
				await f.createInvitation(w.org, { role, inviter: member.user, ...target }),
			]),
		),
	);
	return { links, invitations } as {
		links: Record<Role, Awaited<ReturnType<typeof f.createInviteLink>>>;
		invitations: Record<Role, Awaited<ReturnType<typeof f.createInvitation>>>;
	};
}

async function expectRevoked(link: { id: string; token: string }) {
	const now = await linkState(link.id);
	expect(now.enabled).toBe(false);
	expect(now.token).not.toBe(link.token);
}

async function expectUntouched(link: { id: string; token: string; enabled: boolean }) {
	expect(await linkState(link.id)).toEqual({ enabled: link.enabled, token: link.token });
}

// ─── Removing, leaving ──────────────────────────────────────────────────────

describe("removeMember", () => {
	it("revokes every link and cancels every pending invitation of the removed member", async () => {
		const admin = await f.createMember(w.org, ADMIN);
		const out = await handedOut(admin);
		signIn(w.owner.user, w.org.id);

		await removeMember(admin.id);

		for (const link of Object.values(out.links)) await expectRevoked(link);
		for (const inv of Object.values(out.invitations)) {
			expect(await invitationStatus(inv.id)).toBe("canceled");
		}
	});

	it("also gives disabled links a new token, so enabling them later doesn't revive the old one", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const link = await f.createInviteLink(w.org, { role: REVIEWER, createdBy: member.user });
		await prisma.inviteLink.update({ where: { id: link.id }, data: { enabled: false } });
		signIn(w.owner.user, w.org.id);

		await removeMember(member.id);

		expect((await linkState(link.id)).token).not.toBe(link.token);
	});

	it("leaves accepted invitations, other members' links and other orgs alone", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const accepted = await f.createInvitation(w.org, { inviter: member.user });
		await prisma.invitation.update({ where: { id: accepted.id }, data: { status: "accepted" } });
		const colleague = await f.createMember(w.org, MEMBER);
		const colleagueLink = await f.createInviteLink(w.org, { createdBy: colleague.user });
		// same user, other org
		await f.createMember(w.other, OWNER, member.user);
		const elsewhere = await f.createInviteLink(w.other, { createdBy: member.user });
		signIn(w.owner.user, w.org.id);

		await removeMember(member.id);

		expect(await invitationStatus(accepted.id)).toBe("accepted");
		await expectUntouched(colleagueLink);
		await expectUntouched(elsewhere);
	});

	it("the saved link no longer lets them back in, even after an admin enables it again", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const link = await f.createInviteLink(w.org, { role: MEMBER, createdBy: member.user });
		signIn(w.owner.user, w.org.id);
		await removeMember(member.id);

		signIn(w.owner.user, w.org.id);
		await setInviteLinkEnabled({
			target: { type: "organization", id: w.org.id },
			role: MEMBER,
			enabled: true,
		});

		const ex = await prisma.user.findUniqueOrThrow({
			where: { id: member.userId },
			include: { memberships: true },
		});
		signIn(ex);
		await expectStatus(joinViaLink(link.token), 404);
		expect(
			await prisma.member.count({ where: { userId: member.userId, organizationId: w.org.id } }),
		).toBe(0);
	});
});

describe("leaveOrganization", () => {
	it("revokes the links and invitations of whoever leaves", async () => {
		const member = await f.createMember(w.org, MEMBER);
		await f.grant(member, { projectId: w.p1.id });
		const out = await handedOut(member, { projectId: w.p1.id });
		signIn(member.user, w.org.id);

		await leaveOrganization(w.org.id);

		for (const link of Object.values(out.links)) await expectRevoked(link);
		for (const inv of Object.values(out.invitations)) {
			expect(await invitationStatus(inv.id)).toBe("canceled");
		}
	});
});

// ─── Demotion ───────────────────────────────────────────────────────────────

describe("changeMemberRole", () => {
	it("admin → member: only the ADMIN links and invitations go", async () => {
		// on a project they also have a grant on, so only the role decides
		const admin = await f.createMember(w.org, ADMIN);
		const out = await handedOut(admin, { projectId: w.p1.id });
		await f.grant(admin, { projectId: w.p1.id });
		signIn(w.owner.user, w.org.id);

		await changeMemberRole({ memberId: admin.id, role: MEMBER });

		await expectRevoked(out.links[ADMIN]);
		expect(await invitationStatus(out.invitations[ADMIN].id)).toBe("canceled");
		for (const role of [MEMBER, REVIEWER] as const) {
			await expectUntouched(out.links[role]);
			expect(await invitationStatus(out.invitations[role].id)).toBe("pending");
		}
	});

	it("member → reviewer: MEMBER links go, REVIEWER links stay", async () => {
		const member = await f.createMember(w.org, MEMBER);
		await f.grant(member, { projectId: w.p1.id });
		const out = await handedOut(member, { projectId: w.p1.id });
		signIn(w.owner.user, w.org.id);

		await changeMemberRole({ memberId: member.id, role: REVIEWER });

		await expectRevoked(out.links[MEMBER]);
		expect(await invitationStatus(out.invitations[MEMBER].id)).toBe("canceled");
		await expectUntouched(out.links[REVIEWER]);
		expect(await invitationStatus(out.invitations[REVIEWER].id)).toBe("pending");
	});

	it("admin → member: org-level and ungranted targets go, granted ones stay", async () => {
		const admin = await f.createMember(w.org, ADMIN);
		const orgLink = await f.createInviteLink(w.org, { role: MEMBER, createdBy: admin.user });
		const onP1 = await f.createInviteLink(w.org, {
			role: REVIEWER,
			createdBy: admin.user,
			projectId: w.p1.id,
		});
		const onT2 = await f.createInvitation(w.org, {
			role: REVIEWER,
			inviter: admin.user,
			timelineId: w.t2.id,
		});
		// as admin they had no grants; they get one on p1 before the demotion
		await f.grant(admin, { projectId: w.p1.id });
		signIn(w.owner.user, w.org.id);

		await changeMemberRole({ memberId: admin.id, role: MEMBER });

		await expectRevoked(orgLink);
		await expectUntouched(onP1);
		expect(await invitationStatus(onT2.id)).toBe("canceled");
	});

	it("member → reviewer keeps what their grants cover", async () => {
		const member = await f.createMember(w.org, MEMBER);
		await f.grant(member, { projectId: w.p1.id });
		const link = await f.createInviteLink(w.org, {
			role: REVIEWER,
			createdBy: member.user,
			projectId: w.p1.id,
		});
		signIn(w.owner.user, w.org.id);

		await changeMemberRole({ memberId: member.id, role: REVIEWER });

		await expectUntouched(link);
	});

	it("a promotion takes nothing away", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const out = await handedOut(member);
		signIn(w.owner.user, w.org.id);

		await changeMemberRole({ memberId: member.id, role: ADMIN });

		for (const link of Object.values(out.links)) await expectUntouched(link);
		for (const inv of Object.values(out.invitations)) {
			expect(await invitationStatus(inv.id)).toBe("pending");
		}
	});
});

// ─── Losing a grant ─────────────────────────────────────────────────────────

describe("removeGrant", () => {
	it("a lost project grant revokes what they handed out for the project and its timelines", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const g = await f.grant(member, { projectId: w.p1.id });
		const onProject = await f.createInviteLink(w.org, {
			createdBy: member.user,
			projectId: w.p1.id,
		});
		const onTimeline = await f.createInviteLink(w.org, {
			createdBy: member.user,
			timelineId: w.t1.id,
		});
		const invite = await f.createInvitation(w.org, { inviter: member.user, timelineId: w.t1.id });
		signIn(w.owner.user, w.org.id);

		await removeGrant(g.id);

		await expectRevoked(onProject);
		await expectRevoked(onTimeline);
		expect(await invitationStatus(invite.id)).toBe("canceled");
	});

	it("keeps what is still covered by another grant", async () => {
		const member = await f.createMember(w.org, MEMBER);
		await f.grant(member, { projectId: w.p1.id });
		const lost = await f.grant(member, { timelineId: w.t2.id });
		const stillCovered = await f.createInviteLink(w.org, {
			createdBy: member.user,
			timelineId: w.t1.id,
		});
		const onProject = await f.createInvitation(w.org, { inviter: member.user, projectId: w.p1.id });
		const gone = await f.createInviteLink(w.org, { createdBy: member.user, timelineId: w.t2.id });
		signIn(w.owner.user, w.org.id);

		await removeGrant(lost.id);

		await expectUntouched(stillCovered);
		expect(await invitationStatus(onProject.id)).toBe("pending");
		await expectRevoked(gone);
	});

	it("a timeline grant does not cover project-level invites", async () => {
		// A project link needs a project grant; after losing the project grant, a remaining
		// timeline grant in that project is not enough to keep it
		const member = await f.createMember(w.org, MEMBER);
		const projectGrant = await f.grant(member, { projectId: w.p1.id });
		const onProject = await f.createInviteLink(w.org, {
			createdBy: member.user,
			projectId: w.p1.id,
		});
		await prisma.memberGrant.create({ data: { memberId: member.id, timelineId: w.t1.id } });
		signIn(w.owner.user, w.org.id);

		await removeGrant(projectGrant.id);

		await expectRevoked(onProject);
	});

	it("leaves the links of the grant's creator and of other members alone", async () => {
		const member = await f.createMember(w.org, MEMBER);
		const g = await f.grant(member, { projectId: w.p1.id }, w.owner.user);
		const ownersLink = await f.createInviteLink(w.org, {
			createdBy: w.owner.user,
			projectId: w.p1.id,
		});
		signIn(w.owner.user, w.org.id);

		await removeGrant(g.id);

		await expectUntouched(ownersLink);
	});
});

// ─── Deleted accounts ───────────────────────────────────────────────────────

describe("creator's account deleted", () => {
	it("a link without creator is invalid", async () => {
		const link = await f.createInviteLink(w.org, { createdBy: null });
		const visitor = await prisma.user.findUniqueOrThrow({
			where: { id: (await f.createUser()).id },
			include: { memberships: true },
		});
		signIn(visitor);

		expect((await getInviteLinkInfo(link.token)).valid).toBe(false);
		await expectStatus(joinViaLink(link.token), 404);
	});

	it("deleting the user really kills their links (createdById → null)", async () => {
		const creator = await f.createUser();
		const link = await f.createInviteLink(w.org, { createdBy: creator });
		await prisma.user.delete({ where: { id: creator.id } });

		expect((await getInviteLinkInfo(link.token)).valid).toBe(false);
	});

	it("an invitation without inviter is invalid", async () => {
		const invitee = await f.createUser({ email: "new@test.local" });
		const inv = await f.createInvitation(w.org, { inviter: null, email: invitee.email });
		signIn(invitee);

		expect((await getInvitationPreview(inv.id)).valid).toBe(false);
		await expectStatus(acceptInvitation(inv.id), 404);
		expect(await prisma.member.count({ where: { userId: invitee.id } })).toBe(0);
	});
});
