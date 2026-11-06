import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	getMemberships,
	getProfile,
	getSessions,
	leaveOrganization,
	revokeSession,
} from "../../../../../src/routes/(root)/profile/profile.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

type User = Awaited<ReturnType<typeof f.createUser>>;
let me: User;

beforeEach(async () => {
	me = await f.createUser({ name: "Me", email: "me@test.local" });
});

async function session(user: { id: string }, data: Record<string, unknown> = {}) {
	return prisma.session.create({
		data: {
			id: randomUUID(),
			token: randomUUID(),
			userId: user.id,
			expiresAt: new Date(Date.now() + 86_400_000),
			...data,
		},
	});
}

describe("getProfile", () => {
	it("returns the signed-in user's profile only", async () => {
		await f.createUser();
		signIn(me);
		expect(await getProfile()).toEqual({
			id: me.id,
			name: "Me",
			email: "me@test.local",
			emailVerified: false,
			createdAt: me.createdAt,
		});
	});

	it("404 when the user row is gone", async () => {
		signIn(me);
		await prisma.user.delete({ where: { id: me.id } });
		await expectStatus(getProfile(), 404);
	});

	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getProfile(), 401);
	});
});

describe("getMemberships", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getMemberships(), 401);
	});

	it("lists the user's orgs with role, sorted by name", async () => {
		const b = await f.createOrg({ name: "Beta" });
		const a = await f.createOrg({ name: "Alpha" });
		const notMine = await f.createOrg({ name: "Aardvark" });
		await f.createMember(b, REVIEWER, me);
		await f.createMember(a, OWNER, me);
		await f.createMember(notMine, OWNER);
		signIn(me);

		expect(await getMemberships()).toEqual([
			{ role: OWNER, id: a.id, name: "Alpha", slug: a.slug },
			{ role: REVIEWER, id: b.id, name: "Beta", slug: b.slug },
		]);
	});
});

describe("getSessions", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getSessions(), 401);
	});

	it("lists own active sessions, most recently used first, with an app label", async () => {
		const browser = await session(me, {
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
			ipAddress: "",
			updatedAt: new Date(1000),
		});
		const device = await session(me, {
			clientId: "io.postpin.desktop",
			deviceName: "Studio Mac",
			ipAddress: "10.0.0.1",
			updatedAt: new Date(3000),
		});
		const unknownClient = await session(me, { clientId: "com.example", updatedAt: new Date(2000) });
		const noAgent = await session(me, { updatedAt: new Date(500) });
		await session(me, { expiresAt: new Date(Date.now() - 1000) });
		await session(await f.createUser());

		signIn(me);
		const res = await getSessions();
		expect(res.map((s) => [s.id, s.app, s.deviceName, s.ipAddress])).toEqual([
			[device.id, "PostPin Desktop", "Studio Mac", "10.0.0.1"],
			[unknownClient.id, "com.example", null, null],
			[browser.id, "Safari on macOS", null, null],
			[noAgent.id, "Unknown device", null, null],
		]);
	});

	it("marks the current session", async () => {
		const current = await session(me, { id: `session-${me.id}` }); // the id signIn() uses
		const other = await session(me);
		signIn(me);
		const flags = Object.fromEntries((await getSessions()).map((s) => [s.id, s.current]));
		expect(flags).toEqual({ [current.id]: true, [other.id]: false });
	});
});

describe("revokeSession", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(revokeSession("x"), 401);
	});

	it("deletes another own session", async () => {
		const other = await session(me);
		signIn(me);
		await revokeSession(other.id);
		expect(await prisma.session.count({ where: { id: other.id } })).toBe(0);
	});

	it("400 for the current session", async () => {
		const current = await session(me, { id: `session-${me.id}` });
		signIn(me);
		await expectStatus(revokeSession(current.id), 400);
		expect(await prisma.session.count({ where: { id: current.id } })).toBe(1);
	});

	it("never deletes another user's session", async () => {
		const theirs = await session(await f.createUser());
		signIn(me);
		await revokeSession(theirs.id);
		expect(await prisma.session.count({ where: { id: theirs.id } })).toBe(1);
	});

	it("400 for a non-string id", async () => {
		signIn(me);
		await expectStatus(revokeSession(42 as never), 400);
	});
});

describe("leaveOrganization", () => {
	it("401 when signed out", async () => {
		const org = await f.createOrg();
		signOut();
		await expectStatus(leaveOrganization(org.id), 401);
	});

	it("404 for an org the user isn't in", async () => {
		const org = await f.createOrg();
		await f.createMember(org, OWNER);
		signIn(me);
		await expectStatus(leaveOrganization(org.id), 404);
	});

	it.each([ADMIN, MEMBER, REVIEWER])("a %s leaves; their grants go with them", async (role) => {
		const org = await f.createOrg();
		await f.createMember(org, OWNER);
		const m = await f.createMember(org, role, me);
		const project = await f.createProject(org);
		await f.grant(m, { projectId: project.id });
		signIn(me, org.id);

		await leaveOrganization(org.id);
		expect(await prisma.member.count({ where: { id: m.id } })).toBe(0);
		expect(await prisma.memberGrant.count()).toBe(0);
		// leaving one org doesn't touch others
		expect(await prisma.member.count({ where: { organizationId: org.id } })).toBe(1);
	});

	it("400 for the last owner", async () => {
		const org = await f.createOrg();
		const m = await f.createMember(org, OWNER, me);
		await f.createMember(org, ADMIN);
		signIn(me, org.id);
		await expectStatus(leaveOrganization(org.id), 400);
		expect(await prisma.member.count({ where: { id: m.id } })).toBe(1);
	});

	it("an owner may leave when another owner remains", async () => {
		const org = await f.createOrg();
		const m = await f.createMember(org, OWNER, me);
		await f.createMember(org, OWNER);
		signIn(me, org.id);
		await leaveOrganization(org.id);
		expect(await prisma.member.count({ where: { id: m.id } })).toBe(0);
	});
});
