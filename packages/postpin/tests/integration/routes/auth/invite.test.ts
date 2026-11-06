import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { auth } from "#lib/server/auth.ts";
import {
	acceptInvitation,
	getInvitationPreview,
} from "../../../../src/routes/auth/invite/[id]/invite.remote.ts";
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
	const invitee = await f.createUser({ email: "invitee@test.local" });
	return { org, other, owner, project, timeline, invitee };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
	setActive = vi.spyOn(auth.api, "setActiveOrganization").mockResolvedValue(null as never);
	return () => setActive.mockRestore();
});

const expire = (id: string) =>
	prisma.invitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

const membershipOf = (userId: string, organizationId = w.org.id) =>
	prisma.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		include: { memberGrants: true },
	});

// ─── getInvitationPreview ───────────────────────────────────────────────────

describe("getInvitationPreview", () => {
	it("shows a pending invitation to anyone, also signed out", async () => {
		const inv = await f.createInvitation(w.org, { email: "invitee@test.local", role: REVIEWER });
		signOut();
		expect(await getInvitationPreview(inv.id)).toEqual({
			valid: true,
			email: "invitee@test.local",
			role: REVIEWER,
			organizationName: "Acme",
			currentUserEmail: null,
		});
	});

	it("includes the signed-in user's e-mail", async () => {
		const inv = await f.createInvitation(w.org);
		signIn(w.owner.user);
		expect((await getInvitationPreview(inv.id)).currentUserEmail).toBe(w.owner.user.email);
	});

	it.each([
		["expired", async (id: string) => void (await expire(id))],
		[
			"accepted",
			async (id: string) =>
				void (await prisma.invitation.update({ where: { id }, data: { status: "accepted" } })),
		],
		[
			"canceled",
			async (id: string) =>
				void (await prisma.invitation.update({ where: { id }, data: { status: "canceled" } })),
		],
	])("reveals nothing for an %s invitation", async (_label, spoil) => {
		const inv = await f.createInvitation(w.org);
		await spoil(inv.id);
		expect(await getInvitationPreview(inv.id)).toEqual({
			valid: false,
			email: null,
			role: null,
			organizationName: null,
			currentUserEmail: null,
		});
	});

	it("unknown id → invalid", async () => {
		expect((await getInvitationPreview("nope")).valid).toBe(false);
	});
});

// ─── acceptInvitation ───────────────────────────────────────────────────────

describe("acceptInvitation", () => {
	it("401 when not signed in", async () => {
		const inv = await f.createInvitation(w.org, { email: w.invitee.email });
		signOut();
		await expectStatus(acceptInvitation(inv.id), 401);
	});

	it("org invitation: joins with the invited role, no grant, sets the active org", async () => {
		const inv = await f.createInvitation(w.org, { email: w.invitee.email, role: ADMIN });
		signIn(w.invitee);

		expect(await acceptInvitation(inv.id)).toEqual({ organizationId: w.org.id });

		const m = await membershipOf(w.invitee.id);
		expect(m).toMatchObject({ role: ADMIN, memberGrants: [] });
		expect((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
			"accepted",
		);
		expect(setActive).toHaveBeenCalledOnce();
		expect(setActive.mock.calls[0][0]).toMatchObject({ body: { organizationId: w.org.id } });
	});

	it("project invitation: joins and gets a project grant from the inviter", async () => {
		const inv = await f.createInvitation(w.org, {
			email: w.invitee.email,
			role: REVIEWER,
			projectId: w.project.id,
			inviter: w.owner.user,
		});
		signIn(w.invitee);
		await acceptInvitation(inv.id);

		const m = await membershipOf(w.invitee.id);
		expect(m!.role).toBe(REVIEWER);
		expect(m!.memberGrants).toMatchObject([
			{ projectId: w.project.id, timelineId: null, createdById: w.owner.user.id },
		]);
	});

	it("timeline invitation: joins and gets a timeline grant", async () => {
		const inv = await f.createInvitation(w.org, {
			email: w.invitee.email,
			timelineId: w.timeline.id,
		});
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		expect((await membershipOf(w.invitee.id))!.memberGrants).toMatchObject([
			{ projectId: null, timelineId: w.timeline.id },
		]);
	});

	it("matches the e-mail address case-insensitively", async () => {
		const inv = await f.createInvitation(w.org, { email: "INVITEE@test.local" });
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		expect(await membershipOf(w.invitee.id)).not.toBeNull();
	});

	it("403 for an invitation sent to another address; nothing changes", async () => {
		const inv = await f.createInvitation(w.org, { email: "someone-else@test.local" });
		signIn(w.invitee);
		await expectStatus(acceptInvitation(inv.id), 403);
		expect(await membershipOf(w.invitee.id)).toBeNull();
		expect((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
			"pending",
		);
		expect(setActive).not.toHaveBeenCalled();
	});

	it("404 for an expired invitation", async () => {
		const inv = await f.createInvitation(w.org, { email: w.invitee.email });
		await expire(inv.id);
		signIn(w.invitee);
		await expectStatus(acceptInvitation(inv.id), 404);
		expect(await membershipOf(w.invitee.id)).toBeNull();
	});

	it.each(["accepted", "canceled"])("404 for an %s invitation", async (status) => {
		const inv = await f.createInvitation(w.org, { email: w.invitee.email });
		await prisma.invitation.update({ where: { id: inv.id }, data: { status } });
		signIn(w.invitee);
		await expectStatus(acceptInvitation(inv.id), 404);
		expect(await membershipOf(w.invitee.id)).toBeNull();
	});

	it("can only be accepted once", async () => {
		const inv = await f.createInvitation(w.org, { email: w.invitee.email });
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		await expectStatus(acceptInvitation(inv.id), 404);
		expect(await prisma.member.count({ where: { userId: w.invitee.id } })).toBe(1);
	});

	it("an existing member keeps their role and gets the grant", async () => {
		const existing = await f.createMember(w.org, REVIEWER, w.invitee);
		const inv = await f.createInvitation(w.org, {
			email: w.invitee.email,
			role: MEMBER,
			projectId: w.project.id,
		});
		signIn(w.invitee);
		await acceptInvitation(inv.id);

		const m = await membershipOf(w.invitee.id);
		expect(m!.id).toBe(existing.id);
		expect(m!.role).toBe(REVIEWER);
		expect(m!.memberGrants).toMatchObject([{ projectId: w.project.id }]);
	});

	it("an existing admin gets no grant (sees everything already)", async () => {
		await f.createMember(w.org, ADMIN, w.invitee);
		const inv = await f.createInvitation(w.org, {
			email: w.invitee.email,
			projectId: w.project.id,
		});
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		const m = await membershipOf(w.invitee.id);
		expect(m).toMatchObject({ role: ADMIN, memberGrants: [] });
	});

	it("a project grant makes an existing timeline grant redundant", async () => {
		const existing = await f.createMember(w.org, MEMBER, w.invitee);
		await f.grant(existing, { timelineId: w.timeline.id });
		const inv = await f.createInvitation(w.org, {
			email: w.invitee.email,
			projectId: w.project.id,
		});
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		expect((await membershipOf(w.invitee.id))!.memberGrants).toMatchObject([
			{ projectId: w.project.id, timelineId: null },
		]);
	});

	it("does not touch memberships in other orgs", async () => {
		await f.createMember(w.other, OWNER, w.invitee);
		const inv = await f.createInvitation(w.org, { email: w.invitee.email, role: REVIEWER });
		signIn(w.invitee);
		await acceptInvitation(inv.id);
		expect((await membershipOf(w.invitee.id, w.other.id))!.role).toBe(OWNER);
		expect((await membershipOf(w.invitee.id))!.role).toBe(REVIEWER);
	});
});
