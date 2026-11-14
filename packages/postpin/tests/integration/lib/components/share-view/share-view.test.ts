import { beforeEach, describe, expect, it } from "vitest";
import {
	getShareInfo,
	joinShare,
	recordShareView,
} from "#lib/components/share-view/share-view.remote.ts";
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
			screening: false,
			full: false,
			guest: null,
			needsName: true,
		});
	});

	it("a screening link says so", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { kind: "SCREENING" } });
		expect((await getShareInfo(link.token)).screening).toBe(true);
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

	it("guest limit: full for newcomers (429), whoever joined before stays in", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { maxGuests: 2 } });
		await joinShare({ token: link.token, name: "Anna" });
		await f.createShareGuest(link);
		expect(await getShareInfo(link.token)).toMatchObject({ full: false, guest: { name: "Anna" } });

		const late = fakeCookies();
		useCookies(late.cookies);
		expect(await getShareInfo(link.token)).toMatchObject({ full: true, guest: null });
		await expectStatus(joinShare({ token: link.token, name: "Carl" }), 429);
		expect(await prisma.shareGuest.count({ where: { shareLinkId: link.id } })).toBe(2);
	});

	it("a session of one link is not a guest on another", async () => {
		const exp = await prisma.export.findUniqueOrThrow({ where: { id: link.exportId } });
		const second = await f.createShareLink(exp);
		await joinShare({ token: link.token, name: "Anna" });
		expect((await getShareInfo(second.token)).guest).toBeNull();
	});
	it("400 without a name while the link shows markers", async () => {
		await expectStatus(joinShare({ token: link.token }), 400);
		expect(await prisma.shareGuest.count()).toBe(0);
	});

	it("without the marker panel: joins without a name", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { markerPanelVisible: false } });
		expect((await getShareInfo(link.token)).needsName).toBe(false);
		await joinShare({ token: link.token });
		expect((await getShareInfo(link.token)).guest).toEqual({ name: null });
	});

	it("markers turned on later: asks for the name and adds it to the same guest", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { markerPanelVisible: false } });
		await joinShare({ token: link.token });
		await prisma.shareLink.update({ where: { id: link.id }, data: { markerPanelVisible: true } });
		expect((await getShareInfo(link.token)).needsName).toBe(true);

		await joinShare({ token: link.token, name: "Anna" });
		expect(await prisma.shareGuest.count({ where: { shareLinkId: link.id } })).toBe(1);
		expect(await getShareInfo(link.token)).toMatchObject({
			guest: { name: "Anna" },
			needsName: false,
		});
	});
});

describe("recordShareView", () => {
	const linkRow = () => prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } });

	it("counts a visit and remembers when link and guest were seen", async () => {
		await joinShare({ token: link.token, name: "Anna" });
		await recordShareView(link.token);

		const row = await linkRow();
		expect(row.viewCount).toBe(1);
		expect(row.lastViewedAt).not.toBeNull();
		expect(
			(await prisma.shareGuest.findFirstOrThrow({ where: { shareLinkId: link.id } })).lastViewedAt,
		).not.toBeNull();
	});

	it("a reload within 30 minutes is the same visit, a later one counts again", async () => {
		await joinShare({ token: link.token, name: "Anna" });
		await recordShareView(link.token);
		await recordShareView(link.token);
		expect((await linkRow()).viewCount).toBe(1);

		await prisma.shareGuest.updateMany({
			where: { shareLinkId: link.id },
			data: { lastViewedAt: new Date(Date.now() - 31 * 60 * 1000) },
		});
		await recordShareView(link.token);
		expect((await linkRow()).viewCount).toBe(2);
	});

	it("401 before joining, 410 on a revoked link; nothing counted", async () => {
		await expectStatus(recordShareView(link.token), 401);
		await joinShare({ token: link.token, name: "Anna" });
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		await expectStatus(recordShareView(link.token), 410);
		expect((await linkRow()).viewCount).toBe(0);
	});
});
