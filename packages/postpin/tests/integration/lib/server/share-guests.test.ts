import { beforeEach, describe, expect, it } from "vitest";
import {
	MAX_GUESTS_PER_LINK,
	createShareGuest,
	findShareGuest,
	requireShareGuest,
	shareGuestCookieName,
} from "#lib/server/share-guests.ts";
import { fakeCookies } from "../../../helpers/cookies.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";

let link: Awaited<ReturnType<typeof f.createShareLink>>;
let other: Awaited<ReturnType<typeof f.createShareLink>>;

beforeEach(async () => {
	const project = await f.createProject(await f.createOrg());
	const exp = await f.createExport(await f.createTimeline(project));
	link = await f.createShareLink(exp);
	other = await f.createShareLink(exp);
});

describe("createShareGuest", () => {
	it("sets an httpOnly cookie named after the link, for the whole app, and stores only its hash", async () => {
		const { jar, cookies } = fakeCookies();
		const guest = await createShareGuest(cookies, link, "Anna");

		const cookie = jar.get(shareGuestCookieName(link.id))!;
		expect(cookie.opts).toMatchObject({
			path: "/",
			httpOnly: true,
			sameSite: "lax",
		});
		expect(cookie.opts.maxAge).toBeGreaterThan(0);
		expect(guest).toMatchObject({ shareLinkId: link.id, name: "Anna" });
		expect(guest.sessionTokenHash).not.toBe(cookie.value);
		expect(guest.sessionTokenHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("gives every browser its own session", async () => {
		const a = fakeCookies();
		const b = fakeCookies();
		await createShareGuest(a.cookies, link, "Anna");
		await createShareGuest(b.cookies, link, "Ben");
		expect(a.jar.get(shareGuestCookieName(link.id))!.value).not.toBe(
			b.jar.get(shareGuestCookieName(link.id))!.value,
		);
		expect((await findShareGuest(b.cookies, link))?.name).toBe("Ben");
	});

	it(`429 once a link has ${MAX_GUESTS_PER_LINK} guests`, async () => {
		await prisma.shareGuest.createMany({
			data: Array.from({ length: MAX_GUESTS_PER_LINK }, (_, i) => ({
				shareLinkId: link.id,
				name: `Guest ${i}`,
				sessionTokenHash: `hash-${link.id}-${i}`,
			})),
		});
		const { jar, cookies } = fakeCookies();
		await expectStatus(createShareGuest(cookies, link, "One too many"), 429);
		expect(jar.has(shareGuestCookieName(link.id))).toBe(false);
	});
});

describe("requireShareGuest", () => {
	it("401 without a cookie", async () => {
		await expectStatus(requireShareGuest(link.token, fakeCookies().cookies), 401);
	});

	it("401 with a wrong cookie", async () => {
		const { jar, cookies } = fakeCookies();
		jar.set(shareGuestCookieName(link.id), { value: "forged", opts: {} });
		await expectStatus(requireShareGuest(link.token, cookies), 401);
	});

	it("401 with the cookie of another link's guest", async () => {
		const { cookies } = fakeCookies();
		await createShareGuest(cookies, other, "Anna");
		await expectStatus(requireShareGuest(link.token, cookies), 401);
	});

	it("returns link and guest for a valid session", async () => {
		const { cookies } = fakeCookies();
		const guest = await createShareGuest(cookies, link, "Anna");
		expect(await requireShareGuest(link.token, cookies)).toMatchObject({
			link: { id: link.id },
			guest: { id: guest.id, name: "Anna" },
		});
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("410 once the link is %s, even with a valid session", async (_, change) => {
		const { cookies } = fakeCookies();
		await createShareGuest(cookies, link, "Anna");
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(requireShareGuest(link.token, cookies), 410);
	});

	it("the same guest comes back when an expired link is renewed", async () => {
		const { cookies } = fakeCookies();
		const guest = await createShareGuest(cookies, link, "Anna");
		await prisma.shareLink.update({
			where: { id: link.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		await expectStatus(requireShareGuest(link.token, cookies), 410);

		await prisma.shareLink.update({
			where: { id: link.id },
			data: { expiresAt: new Date(Date.now() + 60_000) },
		});
		expect((await requireShareGuest(link.token, cookies)).guest.id).toBe(guest.id);
	});

	it("404 for an unknown token", async () => {
		await expectStatus(requireShareGuest("nope", fakeCookies().cookies), 404);
	});
});

describe("findShareGuest", () => {
	it("finds nobody without a cookie", async () => {
		expect(await findShareGuest(fakeCookies().cookies, link)).toBeNull();
	});

	it("keeps the cookies of two links apart", async () => {
		const { jar, cookies } = fakeCookies();
		await createShareGuest(cookies, link, "Anna");
		await createShareGuest(cookies, other, "Anna");
		expect(jar.size).toBe(2);
		expect((await findShareGuest(cookies, link))?.shareLinkId).toBe(link.id);
		expect((await findShareGuest(cookies, other))?.shareLinkId).toBe(other.id);
	});
});
