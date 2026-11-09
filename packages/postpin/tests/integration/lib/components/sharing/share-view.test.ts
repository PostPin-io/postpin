import { beforeEach, describe, expect, it } from "vitest";
import { getShareInfo, joinShare } from "#lib/components/sharing/share-view.remote.ts";
import { shareGuestCookieName } from "#lib/server/share-guests.ts";
import { fakeCookies } from "../../../../helpers/cookies.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { useCookies } from "../../../../helpers/request-event.ts";

let link: Awaited<ReturnType<typeof f.createShareLink>>;
let browser: ReturnType<typeof fakeCookies>;

beforeEach(async () => {
	const project = await f.createProject(await f.createOrg());
	const exp = await f.createExport(await f.createTimeline(project), { name: "Cut 3" });
	link = await f.createShareLink(exp);
	browser = fakeCookies();
	useCookies(browser.cookies);
});

describe("getShareInfo", () => {
	it("before joining: the link's settings, no guest", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { note: "Check the ending" } });
		expect(await getShareInfo(link.token)).toEqual({
			exportId: link.exportId,
			exportName: "Cut 3",
			note: "Check the ending",
			timelinePanelVisible: false,
			markerPanelVisible: true,
			guest: null,
		});
	});

	it("404 for an unknown token", async () => {
		await expectStatus(getShareInfo("nope"), 404);
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("410 for a %s link", async (_, change) => {
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(getShareInfo(link.token), 410);
	});
});

describe("joinShare", () => {
	it("creates the guest and sets the link's cookie for the whole app", async () => {
		await joinShare({ token: link.token, name: "  Anna  " });
		expect(browser.jar.get(shareGuestCookieName(link.id))?.opts).toMatchObject({
			path: "/",
			httpOnly: true,
		});
		expect((await getShareInfo(link.token)).guest).toEqual({ name: "Anna" });
	});

	it("joining twice keeps one guest and the first name", async () => {
		await joinShare({ token: link.token, name: "Anna" });
		await joinShare({ token: link.token, name: "Anna again" });
		expect(await prisma.shareGuest.count({ where: { shareLinkId: link.id } })).toBe(1);
		expect((await getShareInfo(link.token)).guest).toEqual({ name: "Anna" });
	});

	it.each([
		["blank", "   "],
		["too long", "x".repeat(81)],
	])("400 for a %s name, no guest", async (_, name) => {
		await expectStatus(joinShare({ token: link.token, name }), 400);
		expect(await prisma.shareGuest.count()).toBe(0);
	});

	it("410 on a revoked link, no guest", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		await expectStatus(joinShare({ token: link.token, name: "Anna" }), 410);
		expect(await prisma.shareGuest.count()).toBe(0);
	});

	it("a session of one link is not a guest on another", async () => {
		const exp = await prisma.export.findUniqueOrThrow({ where: { id: link.exportId } });
		const second = await f.createShareLink(exp);
		await joinShare({ token: link.token, name: "Anna" });
		expect((await getShareInfo(second.token)).guest).toBeNull();
	});
});
