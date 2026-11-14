import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	createMarker,
	createResponse,
	deleteMarker,
	deleteMarkers,
	getMarkers,
	pasteMarkers,
	updateMarker,
} from "#lib/components/review/markers/markers.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { fakeCookies } from "../../../../../helpers/cookies.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn, signOut, useCookies } from "../../../../../helpers/request-event.ts";

/**
 * Share-link guests use the team's marker functions with `shareToken`.
 * Anna and Ben are two guests of the same link, each in their own browser.
 */
async function world() {
	const org = await f.createOrg();
	const project = await f.createProject(org);
	const tl = await f.createTimeline(project);
	const range = { startFrameIndex: 1000, durationFrameCount: 500 };
	const exp = await f.createExport(tl, { snapshot: range });
	const otherExp = await f.createExport(tl, { snapshot: range });
	const owner = await f.createMember(org, Role.OWNER);
	const teamCategory = await f.createCategory(project, { createdBy: owner.user });
	const link = await f.createShareLink(exp, { creator: owner.user });
	const anna = fakeCookies().cookies;
	const ben = fakeCookies().cookies;
	const annaGuest = await createShareGuest(anna, link, "Anna");
	await createShareGuest(ben, link, "Ben");
	return { org, project, exp, otherExp, owner, teamCategory, link, anna, ben, annaGuest };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
	useCookies(w.anna);
});

const key = () => ({ exportId: w.exp.id, shareToken: w.link.token });
const add = (frame = 1200, exportId = w.exp.id) =>
	createMarker({ exportId, name: "Too dark", description: "", frame, shareToken: w.link.token });
const edit = (id: string) =>
	updateMarker({
		id,
		name: "Brighter",
		description: "",
		categoryId: "ignored",
		frame: 1300,
		shareToken: w.link.token,
	});
const guestCategoryId = async () =>
	(await prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })).guestCategoryId;

describe("createMarker as guest", () => {
	it("in the guest category, as the guest, not as a user", async () => {
		const m = await add();
		expect(m).toMatchObject({
			guestId: w.annaGuest.id,
			authorId: null,
			categoryId: await guestCategoryId(),
		});
	});

	it("guests of a screening: in the screening's category", async () => {
		const screeningCategory = await f.createCategory(w.project, { createdBy: w.owner.user });
		await prisma.shareLink.update({
			where: { id: w.link.id },
			data: { kind: "SCREENING", categoryId: screeningCategory.id },
		});
		expect(await add()).toMatchObject({
			guestId: w.annaGuest.id,
			categoryId: screeningCategory.id,
		});
	});

	it("once the screening's category is deleted: the guest category again", async () => {
		const screeningCategory = await f.createCategory(w.project, { createdBy: w.owner.user });
		await prisma.shareLink.update({
			where: { id: w.link.id },
			data: { kind: "SCREENING", categoryId: screeningCategory.id },
		});
		await prisma.category.delete({ where: { id: screeningCategory.id } });

		expect(
			(await prisma.shareLink.findUniqueOrThrow({ where: { id: w.link.id } })).categoryId,
		).toBeNull();
		expect((await add()).categoryId).toBe(await guestCategoryId());
	});

	it("400 outside the timeline", async () => {
		await expectStatus(add(1500), 400);
	});

	it("403 when the link has markers turned off", async () => {
		await prisma.shareLink.update({
			where: { id: w.link.id },
			data: { markerPanelVisible: false },
		});
		await expectStatus(add(), 403);
		await expectStatus(getMarkers(key()), 403);
	});

	it("401 without the cookie, 404 on another export, 410 on a revoked link", async () => {
		useCookies(fakeCookies().cookies);
		await expectStatus(add(), 401);
		useCookies(w.anna);
		await expectStatus(add(1200, w.otherExp.id), 404);
		await prisma.shareLink.update({ where: { id: w.link.id }, data: { revokedAt: new Date() } });
		await expectStatus(add(), 410);
	});
});

describe("visibility and ownership", () => {
	let own: string;
	let bens: string;
	let team: string;

	beforeEach(async () => {
		own = (await add()).id;
		useCookies(w.ben);
		bens = (await add()).id;
		useCookies(w.anna);
		team = (await f.createMarker(w.exp, w.teamCategory, { author: w.owner.user, frame: 1100 })).id;
	});

	it("lists only the guest's own markers, editable, without the team's responses", async () => {
		signIn(w.owner.user, w.org.id);
		await createResponse({ markerId: own, content: "On it" });
		signOut();

		const list = await getMarkers(key());
		expect(list.map((m) => m.id)).toEqual([own]);
		expect(list[0]).toMatchObject({
			responses: [],
			canUpdate: true,
			canDelete: true,
			guest: { name: "Anna" },
		});
	});

	it.each([
		["another guest's", () => bens],
		["a team", () => team],
	])("404 when editing or deleting %s marker", async (_, id) => {
		await expectStatus(edit(id()), 404);
		await expectStatus(deleteMarker({ id: id(), shareToken: w.link.token }), 404);
		expect(await prisma.marker.count({ where: { id: id() } })).toBe(1);
	});

	it("edits the own marker; the category stays the guest category", async () => {
		expect(await edit(own)).toMatchObject({
			name: "Brighter",
			frame: 1300,
			categoryId: await guestCategoryId(),
		});
	});

	it("deletes the own marker", async () => {
		await deleteMarker({ id: own, shareToken: w.link.token });
		expect(await getMarkers(key())).toEqual([]);
	});

	it("bulk delete only removes the own marker; others in the list stay", async () => {
		await deleteMarkers({ exportId: w.exp.id, ids: [own, bens, team], shareToken: w.link.token });
		const left = await prisma.marker.findMany({
			where: { exportId: w.exp.id },
			select: { id: true },
		});
		expect(left.map((m) => m.id).sort()).toEqual([bens, team].sort());
	});

	it("a guest can't respond: no user, 401", async () => {
		await expectStatus(createResponse({ markerId: own, content: "Thanks" }), 401);
	});
});

describe("team view", () => {
	let own: string;

	beforeEach(async () => {
		own = (await add()).id;
		signIn(w.owner.user, w.org.id);
	});

	it("guest markers carry the guest's name; the team can respond", async () => {
		const listed = (await getMarkers(w.exp.id)).find((m) => m.id === own)!;
		expect(listed).toMatchObject({ guest: { name: "Anna" }, author: null });
		await createResponse({ markerId: own, content: "On it" });
	});

	it("paste: copy becomes a team marker, cut keeps the guest; both keep the guest category", async () => {
		const base = {
			sourceExportId: w.exp.id,
			markerIds: [own],
			targetExportId: w.otherExp.id,
			anchorFrame: 1000,
			fallbackCategoryId: w.teamCategory.id,
		};

		await pasteMarkers({ ...base, mode: "copy" });
		expect(
			await prisma.marker.findFirstOrThrow({ where: { exportId: w.otherExp.id, guestId: null } }),
		).toMatchObject({ authorId: w.owner.user.id, categoryId: await guestCategoryId() });

		await pasteMarkers({ ...base, mode: "cut" });
		expect(
			await prisma.marker.findFirstOrThrow({
				where: { exportId: w.otherExp.id, guestId: { not: null } },
			}),
		).toMatchObject({
			guestId: w.annaGuest.id,
			authorId: null,
			categoryId: await guestCategoryId(),
		});
	});
});
