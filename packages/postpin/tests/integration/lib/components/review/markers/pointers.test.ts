import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { MAX_POINTERS_PER_MARKER } from "@postpin-io/shared/logic/pointers";
import {
	createPointer,
	deletePointer,
	getMarkers,
	pasteMarkers,
	updatePointer,
} from "#lib/components/review/markers/markers.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { fakeCookies } from "../../../../../helpers/cookies.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn, signOut, useCookies } from "../../../../../helpers/request-event.ts";

const { MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const arrow = { kind: "ARROW", x: 0.5, y: 0.5 } as const;
const box = { kind: "RECT", x: 0.1, y: 0.2, width: 0.3, height: 0.4 } as const;

const pointersOf = (markerId: string) =>
	prisma.markerPointer.findMany({ where: { markerId }, orderBy: { createdAt: "asc" } });

describe("createPointer", () => {
	it("401 when signed out", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		signOut();
		await expectStatus(createPointer({ markerId: m.id, geometry: arrow }), 401);
	});

	it("red by default, arrows without a size", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		await createPointer({ markerId: m.id, geometry: arrow });
		await createPointer({ markerId: m.id, geometry: box, color: "#5A68E5" });
		expect(await pointersOf(m.id)).toMatchObject([
			{ kind: "ARROW", x: 0.5, y: 0.5, width: null, height: null, color: "#CE272D" },
			{ kind: "RECT", x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: "#5A68E5" },
		]);
	});

	it("getMarkers returns them with the marker", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		const created = await createPointer({ markerId: m.id, geometry: box });
		const markers = await getMarkers(w.exp1.id);
		expect(markers.find((x) => x.id === m.id)?.pointers).toEqual([created]);
	});

	it("a reviewer on their own marker, not on someone else's", async () => {
		const me = await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		const own = await f.createMarker(w.exp1, w.catA, { author: me.user });
		const other = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await createPointer({ markerId: own.id, geometry: arrow });
		await expectStatus(createPointer({ markerId: other.id, geometry: arrow }), 403);
		expect(await pointersOf(other.id)).toEqual([]);
	});

	it("a member on someone else's marker", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		await createPointer({ markerId: m.id, geometry: arrow });
		expect(await pointersOf(m.id)).toHaveLength(1);
	});

	it("404 for a member without a grant", async () => {
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		const m = await f.createMarker(w.exp1, w.catA);
		await expectStatus(createPointer({ markerId: m.id, geometry: arrow }), 404);
	});

	it("400 for a box off the picture or an unknown color", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		await expectStatus(
			createPointer({ markerId: m.id, geometry: { ...box, x: 0.8, width: 0.3 } }),
			400,
		);
		await expectStatus(
			// @ts-expect-error: not one of the preset colors
			createPointer({ markerId: m.id, geometry: arrow, color: "#123456" }),
			400,
		);
	});

	it(`at most ${MAX_POINTERS_PER_MARKER} per marker`, async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		await prisma.markerPointer.createMany({
			data: Array.from({ length: MAX_POINTERS_PER_MARKER }, () => ({
				markerId: m.id,
				...arrow,
				color: "#CE272D",
			})),
		});
		await expectStatus(createPointer({ markerId: m.id, geometry: arrow }), 400);
	});
});

describe("updatePointer", () => {
	it("moves, resizes and recolors", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		const p = await createPointer({ markerId: m.id, geometry: box });
		await updatePointer({ id: p.id, geometry: { ...box, x: 0.5, width: 0.5 }, color: "#EEDCF5" });
		expect(await pointersOf(m.id)).toMatchObject([
			{ x: 0.5, y: 0.2, width: 0.5, height: 0.4, color: "#EEDCF5" },
		]);
	});

	it("only the color: the geometry stays", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		const p = await createPointer({ markerId: m.id, geometry: arrow });
		await updatePointer({ id: p.id, color: "#146D2D" });
		expect(await pointersOf(m.id)).toMatchObject([{ x: 0.5, y: 0.5, color: "#146D2D" }]);
	});

	it("400 when an arrow would become a box", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		const p = await createPointer({ markerId: m.id, geometry: arrow });
		await expectStatus(updatePointer({ id: p.id, geometry: box }), 400);
	});

	it("403 for a reviewer on someone else's marker, 404 for an unknown pointer", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		const p = await prisma.markerPointer.create({
			data: { markerId: m.id, ...arrow, color: "#CE272D" },
		});
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(updatePointer({ id: p.id, color: "#EEDCF5" }), 403);
		await expectStatus(updatePointer({ id: "nope", color: "#EEDCF5" }), 404);
	});
});

describe("deletePointer", () => {
	it("removes only that pointer", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA);
		const a = await createPointer({ markerId: m.id, geometry: arrow });
		await createPointer({ markerId: m.id, geometry: box });
		await deletePointer({ id: a.id });
		expect(await pointersOf(m.id)).toMatchObject([{ kind: "RECT" }]);
	});

	it("403 for a reviewer on someone else's marker", async () => {
		const m = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		const p = await prisma.markerPointer.create({
			data: { markerId: m.id, ...arrow, color: "#CE272D" },
		});
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(deletePointer({ id: p.id }), 403);
		expect(await pointersOf(m.id)).toHaveLength(1);
	});

	it("go with their marker", async () => {
		const m = await f.createMarker(w.exp1, w.catA);
		await prisma.markerPointer.create({ data: { markerId: m.id, ...arrow, color: "#CE272D" } });
		await prisma.marker.delete({ where: { id: m.id } });
		expect(await prisma.markerPointer.count()).toBe(0);
	});
});

describe("pasteMarkers", () => {
	it("copies the pointers with the marker", async () => {
		signIn(w.owner.user, w.org.id);
		const m = await f.createMarker(w.exp1, w.catA, { frame: 20 });
		await createPointer({ markerId: m.id, geometry: arrow, color: "#5A68E5" });
		await createPointer({ markerId: m.id, geometry: box });
		await pasteMarkers({
			sourceExportId: w.exp1.id,
			targetExportId: w.exp1b.id,
			anchorFrame: 100,
			fallbackCategoryId: w.catA.id,
			mode: "copy",
			markerIds: [m.id],
		});
		const pasted = await prisma.marker.findFirstOrThrow({ where: { exportId: w.exp1b.id } });
		expect(await pointersOf(pasted.id)).toMatchObject([
			{ kind: "ARROW", x: 0.5, y: 0.5, color: "#5A68E5" },
			{ kind: "RECT", x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: "#CE272D" },
		]);
		// The original keeps its own
		expect(await pointersOf(m.id)).toHaveLength(2);
	});
});

describe("guests", () => {
	async function guestWorld() {
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });
		const anna = fakeCookies().cookies;
		const ben = fakeCookies().cookies;
		const annaGuest = await createShareGuest(anna, link, "Anna");
		await createShareGuest(ben, link, "Ben");
		return { link, anna, ben, annaGuest };
	}

	it("on their own marker; another guest's looks like it doesn't exist", async () => {
		const g = await guestWorld();
		const own = await f.createMarker(w.exp1, w.catA, { guest: g.annaGuest });
		useCookies(g.anna);
		const p = await createPointer({ markerId: own.id, geometry: arrow, shareToken: g.link.token });
		await updatePointer({ id: p.id, color: "#11CFE4", shareToken: g.link.token });

		useCookies(g.ben);
		await expectStatus(
			createPointer({ markerId: own.id, geometry: arrow, shareToken: g.link.token }),
			404,
		);
		await expectStatus(deletePointer({ id: p.id, shareToken: g.link.token }), 404);
		expect(await pointersOf(own.id)).toMatchObject([{ color: "#11CFE4" }]);
	});

	it("not on the team's markers", async () => {
		const g = await guestWorld();
		const team = await f.createMarker(w.exp1, w.catA, { author: w.owner.user });
		useCookies(g.anna);
		await expectStatus(
			createPointer({ markerId: team.id, geometry: arrow, shareToken: g.link.token }),
			404,
		);
	});

	it("the team sees a guest's pointers", async () => {
		const g = await guestWorld();
		const own = await f.createMarker(w.exp1, w.catA, { guest: g.annaGuest });
		useCookies(g.anna);
		await createPointer({ markerId: own.id, geometry: box, shareToken: g.link.token });
		signIn(w.owner.user, w.org.id);
		const markers = await getMarkers(w.exp1.id);
		expect(markers.find((m) => m.id === own.id)?.pointers).toMatchObject([{ kind: "RECT" }]);
	});
});
