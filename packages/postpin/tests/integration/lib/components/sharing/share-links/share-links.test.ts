import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { screeningDate } from "@postpin-io/shared/logic/share-links";
import {
	createScreeningLink,
	createShareLink,
	getScreeningSetup,
	getShareLinks,
	resumeScreeningLink,
	revokeShareLink,
	updateShareLink,
} from "#lib/components/sharing/share-links/share-links.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../../helpers/request-event.ts";

const { ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;
beforeEach(async () => {
	w = await contentWorld();
});

const linkOf = (id: string) => prisma.shareLink.findUniqueOrThrow({ where: { id } });

describe("createShareLink", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(createShareLink({ exportId: w.exp1.id, preset: "7d" }), 401);
	});

	it("creates with defaults and the guest category", async () => {
		signIn(w.owner.user, w.org.id);
		const { id } = await createShareLink({ exportId: w.exp1.id, preset: "24h", note: "  Hi  " });

		const link = await linkOf(id);
		expect(link).toMatchObject({
			creatorId: w.owner.user.id,
			timelinePanelVisible: false,
			markerPanelVisible: true,
			note: "Hi",
			revokedAt: null,
		});
		expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
		expect(
			(await prisma.project.findUniqueOrThrow({ where: { id: w.projectA.id } })).guestCategoryId,
		).not.toBeNull();
	});

	it("403 for a reviewer with access", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(createShareLink({ exportId: w.exp1.id, preset: "7d" }), 403);
	});

	it("404 for another org's export", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createShareLink({ exportId: w.otherExp.id, preset: "7d" }), 404);
	});

	it.each([
		["unknown preset", { preset: "never" }],
		["note too long", { preset: "7d", note: "x".repeat(2001) }],
	])("400 for %s", async (_, data) => {
		signIn(w.owner.user, w.org.id);
		// @ts-expect-error invalid on purpose
		await expectStatus(createShareLink({ exportId: w.exp1.id, ...data }), 400);
	});
});

describe("updateShareLink / revokeShareLink", () => {
	it("a member updates and revokes their own link", async () => {
		const m = await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		const link = await f.createShareLink(w.exp1, { creator: m.user });

		await updateShareLink({ id: link.id, timelinePanelVisible: true, note: "" });
		expect(await linkOf(link.id)).toMatchObject({ timelinePanelVisible: true, note: null });

		await revokeShareLink({ id: link.id });
		expect((await linkOf(link.id)).revokedAt).not.toBeNull();
	});

	it("403 for a member on someone else's link, an admin may", async () => {
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });

		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(updateShareLink({ id: link.id, note: "x" }), 403);
		await expectStatus(revokeShareLink({ id: link.id }), 403);

		await signInAs(w.org, ADMIN);
		await updateShareLink({ id: link.id, note: "x" });
		await revokeShareLink({ id: link.id });
	});

	it("409 when updating a revoked link; revoking twice keeps the first time", async () => {
		signIn(w.owner.user, w.org.id);
		const revokedAt = new Date("2026-01-01T00:00:00Z");
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user, revokedAt });

		await expectStatus(updateShareLink({ id: link.id, note: "x" }), 409);
		await revokeShareLink({ id: link.id });
		expect((await linkOf(link.id)).revokedAt).toEqual(revokedAt);
	});

	it("a new preset renews an expired link", async () => {
		signIn(w.owner.user, w.org.id);
		const link = await f.createShareLink(w.exp1, { expiresAt: new Date(Date.now() - 1000) });
		await updateShareLink({ id: link.id, preset: "7d" });
		expect((await linkOf(link.id)).expiresAt.getTime()).toBeGreaterThan(Date.now());
	});
});

describe("getShareLinks", () => {
	it("includes visits, guests and the last visit", async () => {
		signIn(w.owner.user, w.org.id);
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });
		const seen = new Date("2026-11-10T09:00:00Z");
		await prisma.shareLink.update({
			where: { id: link.id },
			data: { viewCount: 4, lastViewedAt: seen },
		});
		await prisma.shareGuest.createMany({
			data: [
				{ shareLinkId: link.id, name: "Anna", sessionTokenHash: `h1-${link.id}` },
				{ shareLinkId: link.id, name: "Ben", sessionTokenHash: `h2-${link.id}` },
			],
		});

		expect((await getShareLinks(w.exp1.id)).find((l) => l.id === link.id)).toMatchObject({
			viewCount: 4,
			guestCount: 2,
			lastViewedAt: seen,
		});
	});

	it("lists with status and per-link permissions", async () => {
		const own = await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await f.createShareLink(w.exp1, { creator: own.user });
		await f.createShareLink(w.exp1, { creator: w.owner.user, revokedAt: new Date() });

		const links = await getShareLinks(w.exp1.id);
		expect(links.map((l) => [l.status, l.canUpdate, l.canRevoke])).toEqual(
			expect.arrayContaining([
				["active", true, true],
				["revoked", false, false],
			]),
		);
	});
});

const TZ = "Europe/Berlin";
const today = () => screeningDate(new Date(), TZ);
const categoryOf = async (linkId: string) =>
	(await prisma.shareLink.findUniqueOrThrow({ where: { id: linkId }, include: { category: true } }))
		.category;

describe("createScreeningLink", () => {
	const start = (maxGuests = 30, timeZone = TZ) =>
		createScreeningLink({ exportId: w.exp1.id, maxGuests, timeZone });

	it("creates a link for the screening: markers only, 24 hours, no note, the guest limit", async () => {
		signIn(w.owner.user, w.org.id);
		const res = await start(40);

		const link = await linkOf(res.id);
		expect(link).toMatchObject({
			kind: "SCREENING",
			creatorId: w.owner.user.id,
			token: res.token,
			timelinePanelVisible: false,
			markerPanelVisible: true,
			note: null,
			maxGuests: 40,
		});
		const hours = (link.expiresAt.getTime() - Date.now()) / 3_600_000;
		expect(hours).toBeGreaterThan(23.9);
		expect(hours).toBeLessThanOrEqual(24);
		// the fallback for when the screening's category is deleted
		expect(
			(await prisma.project.findUniqueOrThrow({ where: { id: w.projectA.id } })).guestCategoryId,
		).not.toBeNull();
	});

	it("comes with its own category, named after the day and owned by the presenter", async () => {
		signIn(w.owner.user, w.org.id);
		const { id } = await start();
		expect(await categoryOf(id)).toMatchObject({
			name: `Screening (${today()})`,
			projectId: w.projectA.id,
			createdById: w.owner.user.id,
		});
	});

	it("every start is a new screening: a new link, and the day's categories are numbered", async () => {
		signIn(w.owner.user, w.org.id);
		const first = await start();
		const second = await start();
		const third = await start();

		expect(new Set([first.id, second.id, third.id]).size).toBe(3);
		expect((await categoryOf(second.id))?.name).toBe(`Screening 2 (${today()})`);
		expect((await categoryOf(third.id))?.name).toBe(`Screening 3 (${today()})`);
		// the earlier links keep working
		expect((await linkOf(first.id)).revokedAt).toBeNull();
	});

	it("the numbering is per project", async () => {
		signIn(w.owner.user, w.org.id);
		await start();
		const elsewhere = await createScreeningLink({
			exportId: w.expB.id,
			maxGuests: 10,
			timeZone: TZ,
		});
		expect((await categoryOf(elsewhere.id))?.name).toBe(`Screening (${today()})`);
	});

	it("the date is the presenter's: another time zone can be another day", async () => {
		signIn(w.owner.user, w.org.id);
		const { id } = await start(30, "Pacific/Kiritimati"); // UTC+14
		expect((await categoryOf(id))?.name).toBe(
			`Screening (${screeningDate(new Date(), "Pacific/Kiritimati")})`,
		);
	});

	it("400 above the server's limit, for a broken number or an unknown time zone", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(start(101), 400);
		await expectStatus(start(0), 400);
		await expectStatus(start(2.5), 400);
		await expectStatus(start(30, "Mars/Olympus"), 400);
		expect(await prisma.shareLink.count()).toBe(0);
		expect(await prisma.category.count({ where: { name: { startsWith: "Screening" } } })).toBe(0);
	});

	it("401 signed out, 403 for a reviewer, 404 for another org's export", async () => {
		signOut();
		await expectStatus(start(), 401);
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(start(), 403);
		signIn(w.owner.user, w.org.id);
		await expectStatus(
			createScreeningLink({ exportId: w.otherExp.id, maxGuests: 10, timeZone: TZ }),
			404,
		);
	});
});

describe("resumeScreeningLink", () => {
	let link: { id: string; token: string };
	beforeEach(async () => {
		signIn(w.owner.user, w.org.id);
		link = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 30, timeZone: TZ });
	});

	it("hands back the same link and keeps its category", async () => {
		const category = await categoryOf(link.id);
		expect(await resumeScreeningLink({ id: link.id })).toEqual(link);
		expect(await categoryOf(link.id)).toEqual(category);
		expect((await linkOf(link.id)).maxGuests).toBe(30);
		expect(await prisma.shareLink.count()).toBe(1);
	});

	it("can change the guest limit, never below the guests already in", async () => {
		await resumeScreeningLink({ id: link.id, maxGuests: 50 });
		expect((await linkOf(link.id)).maxGuests).toBe(50);

		for (let i = 0; i < 3; i++) await f.createShareGuest(link);
		await resumeScreeningLink({ id: link.id, maxGuests: 1 });
		expect((await linkOf(link.id)).maxGuests).toBe(3);
	});

	it("400 above the server's limit", async () => {
		await expectStatus(resumeScreeningLink({ id: link.id, maxGuests: 101 }), 400);
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("409 for a %s link", async (_, change) => {
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(resumeScreeningLink({ id: link.id }), 409);
	});

	it("400 for an ordinary share link", async () => {
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await expectStatus(resumeScreeningLink({ id: plain.id }), 400);
	});

	it("a member only runs their own screening link, an admin any", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(resumeScreeningLink({ id: link.id }), 403);
		const own = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 5, timeZone: TZ });
		expect(await resumeScreeningLink({ id: own.id })).toEqual(own);

		await signInAs(w.org, ADMIN);
		expect(await resumeScreeningLink({ id: link.id })).toEqual(link);
	});

	it("404 for an unknown link or another org's", async () => {
		await expectStatus(resumeScreeningLink({ id: "nope" }), 404);
		signIn(w.otherOwner.user, w.other.id);
		await expectStatus(resumeScreeningLink({ id: link.id }), 404);
	});
});

describe("getScreeningSetup", () => {
	it("the limits, and the active screening link the dialog offers to continue", async () => {
		signIn(w.owner.user, w.org.id);
		expect(await getScreeningSetup(w.exp1.id)).toEqual({
			maxGuestsLimit: 100,
			defaultMaxGuests: 30,
			existing: null,
		});

		await createScreeningLink({ exportId: w.exp1.id, maxGuests: 20, timeZone: TZ });
		const newest = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 25, timeZone: TZ });
		await f.createShareGuest(newest);
		expect((await getScreeningSetup(w.exp1.id)).existing).toMatchObject({
			id: newest.id,
			maxGuests: 25,
			guestCount: 1,
			categoryName: `Screening 2 (${today()})`,
		});
	});

	it("only a link the member may run, and only while it is active", async () => {
		signIn(w.owner.user, w.org.id);
		const owners = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 20, timeZone: TZ });

		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		expect((await getScreeningSetup(w.exp1.id)).existing).toBeNull();

		signIn(w.owner.user, w.org.id);
		await prisma.shareLink.update({ where: { id: owners.id }, data: { revokedAt: new Date() } });
		expect((await getScreeningSetup(w.exp1.id)).existing).toBeNull();
	});

	it("403 for a reviewer", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(getScreeningSetup(w.exp1.id), 403);
	});
});

describe("getShareLinks: screening links", () => {
	it("canScreen only for an active screening link the member may edit", async () => {
		signIn(w.owner.user, w.org.id);
		const screeningLink = await createScreeningLink({
			exportId: w.exp1.id,
			maxGuests: 10,
			timeZone: TZ,
		});
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		const flags = async () =>
			Object.fromEntries((await getShareLinks(w.exp1.id)).map((l) => [l.id, l.canScreen]));

		expect(await flags()).toEqual({ [screeningLink.id]: true, [plain.id]: false });
		expect((await getShareLinks(w.exp1.id)).find((l) => l.id === screeningLink.id)).toMatchObject({
			projectId: w.projectA.id,
			timelineId: w.exp1.timelineId,
			category: { name: `Screening (${today()})` },
		});

		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		expect((await flags())[screeningLink.id]).toBe(false);

		signIn(w.owner.user, w.org.id);
		await prisma.shareLink.update({
			where: { id: screeningLink.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		expect((await flags())[screeningLink.id]).toBe(false);
	});
});
