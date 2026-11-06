/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
// @ts-expect-error SvelteKit ships no types for its internal server module
import { with_request_store } from "@sveltejs/kit/internal/server";
import { Role } from "@postpin-io/shared/db/enums";
import { handle } from "../../src/hooks.server.ts";
import { auth } from "#lib/server/auth.ts";
import { prisma } from "../helpers/db.ts";
import * as f from "../helpers/factories.ts";
import { fakeRequestEvent } from "../helpers/api.ts";

/**
 * Runs the app's `handle` the way SvelteKit does (inside a request store). The event shares its
 * `locals` with the fake getRequestEvent(), so authorize() in API controllers sees the session
 * the hooks set up.
 */
async function run(path: string, init: RequestInit = {}) {
	const event = fakeRequestEvent(path, init);
	const resolve = vi.fn(async (_e: RequestEvent) => new Response("page"));
	const res = await with_request_store({ event, state: {} } as never, () =>
		handle({ event, resolve: resolve as never }),
	);
	return { res, resolve, locals: event.locals };
}

/** A real better-auth session in the DB; its token works as a bearer token */
async function createSession(user: { id: string }, activeOrganizationId: string | null = null) {
	const token = randomUUID().replaceAll("-", "");
	const session = await prisma.session.create({
		data: {
			id: randomUUID(),
			token,
			userId: user.id,
			expiresAt: new Date(Date.now() + 7 * 86_400_000),
			activeOrganizationId,
		},
	});
	return { session, headers: { authorization: `Bearer ${token}` } };
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("signed out", () => {
	it("public pages render with empty locals", async () => {
		const { res, resolve, locals } = await run("/");
		expect(resolve).toHaveBeenCalledOnce();
		expect(await res.text()).toBe("page");
		expect(locals.user).toBeNull();
		expect(locals.session).toBeNull();
	});

	it("auth pages are public", async () => {
		const { resolve } = await run("/auth/login");
		expect(resolve).toHaveBeenCalledOnce();
	});

	it("other pages redirect to the login, remembering where the user wanted to go", async () => {
		const { res, resolve } = await run("/projects/abc?x=1");
		expect(resolve).not.toHaveBeenCalled();
		expect(res.status).toBeGreaterThanOrEqual(300);
		expect(res.status).toBeLessThan(400);
		expect(res.headers.get("location")).toBe("/auth/login?redirect=%2Fprojects%2Fabc");
	});

	it("the login redirect is temporary, not a cacheable 301", async () => {
		const { res } = await run("/projects/abc");
		expect([302, 303, 307]).toContain(res.status);
	});

	it("paths that merely contain /auth/ still redirect to the login", async () => {
		const { res, resolve } = await run("/projects/abc/auth/x");
		expect(resolve).not.toHaveBeenCalled();
		expect(res.headers.get("location")).toMatch(/^\/auth\/login/);
	});

	it("an invalid bearer token counts as signed out", async () => {
		const { res, locals } = await run("/projects/abc", {
			headers: { authorization: "Bearer nope" },
		});
		expect(res.status).toBe(303);
		expect(locals.user).toBeNull();
	});

	it("an expired session counts as signed out", async () => {
		const user = await f.createUser();
		const { session, headers } = await createSession(user);
		await prisma.session.update({
			where: { id: session.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		const { locals } = await run("/", { headers });
		expect(locals.user).toBeNull();
	});
});

describe("signed in", () => {
	it("a bearer token signs in: locals hold the session and the user with memberships", async () => {
		const org = await f.createOrg();
		const m = await f.createMember(org, Role.MEMBER);
		const { session, headers } = await createSession(m.user, org.id);

		const { resolve, locals } = await run("/projects/abc", { headers });
		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.session).toMatchObject({
			id: session.id,
			userId: m.userId,
			activeOrganizationId: org.id,
		});
		expect(locals.user).toMatchObject({ id: m.userId, email: m.user.email });
		expect(locals.user!.memberships.map((x) => x.id)).toEqual([m.id]);
	});

	it("uses getSession() from better-auth with the request headers", async () => {
		const user = await f.createUser();
		const spy = vi.spyOn(auth.api, "getSession").mockResolvedValue({
			session: { id: "s1", userId: user.id, activeOrganizationId: null },
			user: { id: user.id },
		} as never);
		const { locals } = await run("/dashboard", { headers: { cookie: "a=b" } });
		expect((spy.mock.calls[0]![0] as { headers: Headers }).headers.get("cookie")).toBe("a=b");
		expect(locals.user).toMatchObject({ id: user.id, memberships: [] });
	});

	it("memberships come oldest first", async () => {
		const user = await f.createUser();
		const a = await f.createMember(await f.createOrg(), Role.MEMBER, user);
		const b = await f.createMember(await f.createOrg(), Role.OWNER, user);
		await prisma.member.update({
			where: { id: a.id },
			data: { createdAt: new Date(Date.now() + 1000) },
		});
		const { headers } = await createSession(user);
		const { locals } = await run("/", { headers });
		expect(locals.user!.memberships.map((x) => x.id)).toEqual([b.id, a.id]);
	});
});

describe("signed in without an organization", () => {
	async function noOrgUser() {
		const user = await f.createUser();
		return (await createSession(user)).headers;
	}

	it.each(["/projects/abc", "/organizations/acme/members", "/administrator", "/dashboardx"])(
		"%s redirects to the dashboard (303)",
		async (path) => {
			const { res, resolve } = await run(path, { headers: await noOrgUser() });
			expect(resolve).not.toHaveBeenCalled();
			expect(res.status).toBe(303);
			expect(res.headers.get("location")).toBe("/dashboard");
		},
	);

	it.each([
		["the dashboard", "/dashboard"],
		["the profile", "/profile"],
		["pages below them", "/profile/security"],
		["the admin area", "/admin"],
		["the start page", "/"],
		["accepting an invitation", "/auth/invite/inv1"],
		["joining via invite link", "/auth/join/token1"],
		["remote functions (dashboard, profile)", "/_app/remote/abc123/getProfile"],
	])("may open %s (%s)", async (_, path) => {
		const { res, resolve } = await run(path, { headers: await noOrgUser() });
		expect(resolve).toHaveBeenCalledOnce();
		expect(res.headers.get("location")).toBeNull();
	});

	it("API requests are answered by the API, not redirected", async () => {
		const { res, resolve } = await run("/api/projects", { headers: await noOrgUser() });
		expect(resolve).not.toHaveBeenCalled();
		expect(res.status).not.toBe(303);
		expect(res.headers.get("location")).toBeNull();
	});
});

describe("active organization", () => {
	it("keeps a valid active org and remembers it as the last active one", async () => {
		const user = await f.createUser();
		await f.createMember(await f.createOrg(), Role.OWNER, user);
		const org = await f.createOrg();
		await f.createMember(org, Role.MEMBER, user);
		const { session, headers } = await createSession(user, org.id);

		const { locals } = await run("/", { headers });
		expect(locals.session!.activeOrganizationId).toBe(org.id);
		expect(locals.user!.lastActiveOrganizationId).toBe(org.id);
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeOrganizationId,
		).toBe(org.id);
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastActiveOrganizationId,
		).toBe(org.id);
	});

	it("without an active org, falls back to the last active one", async () => {
		const user = await f.createUser();
		await f.createMember(await f.createOrg(), Role.OWNER, user);
		const last = await f.createOrg();
		await f.createMember(last, Role.MEMBER, user);
		await prisma.user.update({
			where: { id: user.id },
			data: { lastActiveOrganizationId: last.id },
		});
		const { session, headers } = await createSession(user);

		const { locals } = await run("/", { headers });
		expect(locals.session!.activeOrganizationId).toBe(last.id);
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeOrganizationId,
		).toBe(last.id);
	});

	it("falls back to the oldest membership when the active and last org are no longer the user's", async () => {
		const user = await f.createUser();
		const first = await f.createOrg();
		await f.createMember(first, Role.REVIEWER, user);
		const second = await f.createOrg();
		await f.createMember(second, Role.OWNER, user);
		const left = await f.createOrg();
		await prisma.user.update({
			where: { id: user.id },
			data: { lastActiveOrganizationId: left.id },
		});
		const { session, headers } = await createSession(user, left.id);

		const { locals } = await run("/", { headers });
		expect(locals.session!.activeOrganizationId).toBe(first.id);
		expect(locals.user!.lastActiveOrganizationId).toBe(first.id);
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeOrganizationId,
		).toBe(first.id);
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastActiveOrganizationId,
		).toBe(first.id);
	});

	it("clears an active org the user has left when they have no orgs at all", async () => {
		const user = await f.createUser();
		const left = await f.createOrg();
		const { session, headers } = await createSession(user, left.id);
		const { locals } = await run("/dashboard", { headers });
		expect(locals.session!.activeOrganizationId).toBeNull();
		expect(
			(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeOrganizationId,
		).toBeNull();
	});
});

describe("routing", () => {
	it("/api/auth/* is answered by better-auth", async () => {
		const { res, resolve } = await run("/api/auth/ok");
		expect(resolve).not.toHaveBeenCalled();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("/api/* goes to hapi and is not redirected when signed out", async () => {
		const { res, resolve } = await run("/api/v1/projects");
		expect(resolve).not.toHaveBeenCalled();
		expect(res.status).toBe(401);
	});

	it("/api/* with a bearer token reaches the controllers as that user", async () => {
		const org = await f.createOrg();
		const m = await f.createMember(org, Role.MEMBER);
		const granted = await f.createProject(org);
		await f.createProject(org);
		await f.grant(m, { projectId: granted.id });
		const { headers } = await createSession(m.user, org.id);

		const list = await run("/api/v1/projects", { headers });
		expect(list.resolve).not.toHaveBeenCalled();
		expect(list.res.status).toBe(200);
		expect((await list.res.json()).map((p: { id: string }) => p.id)).toEqual([granted.id]);

		// authorize() reads getRequestEvent(), which sees the same session
		const one = await run(`/api/v1/projects/${granted.id}`, { headers });
		expect(one.res.status).toBe(200);
		expect((await one.res.json()).id).toBe(granted.id);
	});

	it("other pages are resolved by SvelteKit", async () => {
		const user = await f.createUser();
		await f.createMember(await f.createOrg(), Role.OWNER, user);
		const { headers } = await createSession(user);
		const { resolve } = await run("/projects/abc", { headers });
		expect(resolve).toHaveBeenCalledOnce();
	});
});
