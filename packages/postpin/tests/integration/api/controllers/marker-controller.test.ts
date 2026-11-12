import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { MarkerController } from "../../../../src/api/controllers/MarkerController.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { expectHttpError, signInApi } from "../../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../../helpers/api-world.ts";
import { signOut } from "../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ApiWorld;
const controller = new MarkerController();

beforeEach(async () => {
	w = await apiWorld();
});

type UploadMarker = Parameters<MarkerController["uploadMarkers"]>[3][number];

const marker = (data: Partial<UploadMarker> = {}): UploadMarker => ({
	name: "New",
	description: null,
	frame: 1,
	categoryId: w.category.id,
	...data,
});

const upload = (
	markers: UploadMarker[],
	exportId = w.exp1.id,
	timelineId = w.tl1.id,
	projectId = w.projectA.id,
) => controller.uploadMarkers(projectId, timelineId, exportId, markers);

const markersOf = (exportId: string) =>
	prisma.marker.findMany({ where: { exportId }, orderBy: { frame: "asc" } });

// ─── getMarkers ─────────────────────────────────────────────────────────────

describe("getMarkers", () => {
	it("lists the export's markers by frame (desc) with their responses", async () => {
		const later = await f.createMarker(w.exp1, w.category, { frame: 50 });
		await f.createMarker(w.exp2, w.category, { frame: 99 });
		const r1 = await prisma.response.create({ data: { markerId: w.marker1.id, content: "first" } });
		const r2 = await prisma.response.create({
			data: { markerId: w.marker1.id, content: "second", createdAt: new Date(Date.now() + 1000) },
		});
		await signInApi(w.owner.user, w.org.id);

		const markers = await controller.getMarkers(w.projectA.id, w.tl1.id, w.exp1.id);
		expect(markers.map((m) => m.id)).toEqual([later.id, w.marker1.id]);
		expect(markers[1]!.responses.map((r) => r.id)).toEqual([r2.id, r1.id]);
	});

	it.each([MEMBER, REVIEWER])("%s with a timeline grant may read", async (role) => {
		await signInAs(w, role, { timelineId: w.tl1.id });
		const markers = await controller.getMarkers(w.projectA.id, w.tl1.id, w.exp1.id);
		expect(markers.map((m) => m.id)).toEqual([w.marker1.id]);
	});

	it("404 without a grant on the export's timeline", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl2.id });
		await expectHttpError(controller.getMarkers(w.projectA.id, w.tl1.id, w.exp1.id), 404);
	});

	it("404 for another org's export", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			controller.getMarkers(w.otherProject.id, w.otherTimeline.id, w.otherExport.id),
			404,
		);
	});

	it("returns nothing when the path doesn't match the export", async () => {
		await signInApi(w.owner.user, w.org.id);
		expect(await controller.getMarkers(w.projectA.id, w.tl2.id, w.exp1.id)).toEqual([]);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(controller.getMarkers(w.projectA.id, w.tl1.id, w.exp1.id), 401);
	});
});

// ─── uploadMarkers: creating ────────────────────────────────────────────────

describe("uploadMarkers: creating", () => {
	it.each([OWNER, ADMIN])("%s adds new markers, authored by them", async (role) => {
		const me = await signInAs(w, role);
		await upload([
			marker({ name: "A", frame: 100, nleId: "nle-1", description: "d" }),
			marker({ name: "B", frame: 200 }),
		]);

		const added = (await markersOf(w.exp1.id)).filter((m) => m.id !== w.marker1.id);
		expect(added).toMatchObject([
			{
				name: "A",
				frame: 100,
				nleId: "nle-1",
				description: "d",
				authorId: me.userId,
				categoryId: w.category.id,
			},
			{ name: "B", frame: 200, nleId: null, authorId: me.userId },
		]);
	});

	it.each([MEMBER, REVIEWER])("%s with a grant adds markers", async (role) => {
		const me = await signInAs(w, role, { timelineId: w.tl1.id });
		await upload([marker({ frame: 5 })]);
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id, authorId: me.userId } })).toBe(
			1,
		);
	});

	it("timeline-grant member may use the project's categories", async () => {
		await signInAs(w, MEMBER, { timelineId: w.tl2.id });
		await upload([marker()], w.exp2.id, w.tl2.id);
		expect(await prisma.marker.count({ where: { exportId: w.exp2.id } })).toBe(1);
	});

	it.each([MEMBER, REVIEWER])("%s without a grant gets 404", async (role) => {
		await signInAs(w, role, { timelineId: w.tl2.id });
		await expectHttpError(upload([marker()]), 404);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("404 for another org's export", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(
			upload(
				[marker({ categoryId: w.otherCategory.id })],
				w.otherExport.id,
				w.otherTimeline.id,
				w.otherProject.id,
			),
			404,
		);
	});

	it.each([
		["timeline", () => [w.projectA.id, w.tl2.id]],
		["project", () => [w.projectB.id, w.tl1.id]],
	])("404 when the %s of the path doesn't match the export", async (_, path) => {
		await signInApi(w.owner.user, w.org.id);
		const [projectId, timelineId] = path();
		await expectHttpError(upload([marker()], w.exp1.id, timelineId, projectId), 404);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("400 for a category of another project", async () => {
		const foreign = await f.createCategory(w.projectB);
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(upload([marker(), marker({ categoryId: foreign.id })]), 400);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("400 for a category of another org", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(upload([marker({ categoryId: w.otherCategory.id })]), 400);
	});

	it("400 for an unknown category", async () => {
		await signInApi(w.owner.user, w.org.id);
		await expectHttpError(upload([marker({ categoryId: "nope" })]), 400);
	});

	it("400 above 2000 markers, before touching the database", async () => {
		await signInApi(w.owner.user, w.org.id);
		const many = Array.from({ length: 2001 }, (_, i) => marker({ frame: i }));
		await expectHttpError(upload(many), 400);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("stores the duration, and markers without one are point markers", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ nleId: "range", duration: 48 }), marker({ nleId: "point" })]);
		const rows = await prisma.marker.findMany({
			where: { exportId: w.exp1.id, nleId: { not: null } },
			orderBy: { nleId: "asc" },
		});
		expect(rows.map((m) => [m.nleId, m.duration])).toEqual([
			["point", 0],
			["range", 48],
		]);
	});

	it.each([-1, 1.5, Number.NaN])(
		"400 for duration %s, and nothing is written",
		async (duration) => {
			await signInApi(w.owner.user, w.org.id);
			await expectHttpError(upload([marker(), marker({ duration })]), 400);
			expect(await prisma.marker.count()).toBe(1);
		},
	);

	it("frames aren't checked against the timeline, exports may cover only part of it", async () => {
		const partial = await f.createExport(w.tl1, {
			snapshot: { startFrameIndex: 100, durationFrameCount: 10 },
		});
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ frame: 5, duration: 500 })], partial.id);
		expect(await prisma.marker.count({ where: { exportId: partial.id } })).toBe(1);
	});

	it("an empty upload changes nothing", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([]);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectHttpError(upload([marker()]), 401);
	});
});

// ─── uploadMarkers: updating ────────────────────────────────────────────────

describe("uploadMarkers: updating", () => {
	it("an upload without duration keeps the marker's duration (plugins from before ranges)", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ nleId: "nle-1", duration: 24 })]);
		await upload([marker({ frame: 9, nleId: "nle-1" })]);
		const row = await prisma.marker.findFirstOrThrow({ where: { nleId: "nle-1" } });
		expect(row).toMatchObject({ frame: 9, duration: 24 });
	});

	it("an upload with duration 0 turns a range into a point marker", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ nleId: "nle-1", duration: 24 })]);
		await upload([marker({ nleId: "nle-1", duration: 0 })]);
		const row = await prisma.marker.findFirstOrThrow({ where: { nleId: "nle-1" } });
		expect(row.duration).toBe(0);
	});

	it("a marker with a known nleId is updated, not added again", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ name: "v1", nleId: "nle-1" })]);
		await upload([marker({ name: "v2", frame: 7, nleId: "nle-1" })]);

		const rows = await prisma.marker.findMany({ where: { exportId: w.exp1.id, nleId: "nle-1" } });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: "v2", frame: 7 });
	});

	it("nleIds are per export: the same nleId in another export is a new marker", async () => {
		await f
			.createMarker(w.exp2, w.category)
			.then((m) => prisma.marker.update({ where: { id: m.id }, data: { nleId: "nle-1" } }));
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ nleId: "nle-1" })]);
		expect(await prisma.marker.count({ where: { nleId: "nle-1" } })).toBe(2);
	});

	it("a pulled marker is matched by id and takes over the nleId from an earlier pushed copy", async () => {
		await signInApi(w.owner.user, w.org.id);
		await upload([marker({ name: "copy", nleId: "nle-1" })]);
		await upload([{ ...marker({ name: "pulled", nleId: "nle-1" }), id: w.marker1.id }]);

		const pulled = await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } });
		expect(pulled).toMatchObject({ name: "pulled", nleId: "nle-1" });
		const copy = await prisma.marker.findFirstOrThrow({ where: { name: "copy" } });
		expect(copy.nleId).toBeNull();
	});

	it("an id from another export doesn't touch that marker, it adds a new one", async () => {
		const elsewhere = await f.createMarker(w.exp2, w.category, { author: w.owner.user });
		await signInApi(w.owner.user, w.org.id);
		await upload([{ ...marker({ name: "hijack" }), id: elsewhere.id }]);

		expect((await prisma.marker.findUniqueOrThrow({ where: { id: elsewhere.id } })).name).toBe(
			elsewhere.name,
		);
		expect(await prisma.marker.count({ where: { exportId: w.exp1.id, name: "hijack" } })).toBe(1);
	});

	it("member with a grant may update markers of others", async () => {
		await signInAs(w, MEMBER, { projectId: w.projectA.id });
		await upload([{ ...marker({ name: "edited" }), id: w.marker1.id }]);
		const m = await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } });
		expect(m).toMatchObject({ name: "edited", authorId: w.owner.userId });
	});

	it("reviewer may update their own markers", async () => {
		const me = await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		const own = await f.createMarker(w.exp1, w.category, { author: me.user });
		await upload([{ ...marker({ name: "edited" }), id: own.id }]);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: own.id } })).name).toBe("edited");
	});

	it("reviewer gets 403 when an id matches someone else's marker", async () => {
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectHttpError(
			upload([marker({ name: "new" }), { ...marker({ name: "edited" }), id: w.marker1.id }]),
			403,
		);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } })).name).toBe(
			w.marker1.name,
		);
		expect(await prisma.marker.count()).toBe(1);
	});

	it("reviewer gets 403 when an nleId matches someone else's marker", async () => {
		await prisma.marker.update({ where: { id: w.marker1.id }, data: { nleId: "nle-1" } });
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectHttpError(upload([marker({ name: "edited", nleId: "nle-1" })]), 403);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } })).name).toBe(
			w.marker1.name,
		);
	});

	it("for reviewers, markers without author count as someone else's", async () => {
		const orphan = await f.createMarker(w.exp1, w.category);
		await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		await expectHttpError(upload([{ ...marker(), id: orphan.id }]), 403);
	});

	it("reviewer can't steal the nleId of someone else's marker with their own pulled marker", async () => {
		await prisma.marker.update({ where: { id: w.marker1.id }, data: { nleId: "nle-1" } });
		const me = await signInAs(w, REVIEWER, { timelineId: w.tl1.id });
		const own = await f.createMarker(w.exp1, w.category, { author: me.user });
		await expectHttpError(upload([{ ...marker(), id: own.id, nleId: "nle-1" }]), 403);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: w.marker1.id } })).nleId).toBe(
			"nle-1",
		);
	});
});
