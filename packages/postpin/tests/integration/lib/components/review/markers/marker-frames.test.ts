import { beforeEach, describe, expect, it } from "vitest";
import {
	createMarker,
	pasteMarkers,
	updateMarker,
} from "#lib/components/review/markers/markers.remote.ts";
import { contentWorld, type ContentWorld } from "../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../helpers/expect.ts";
import * as f from "../../../../../helpers/factories.ts";
import { signIn } from "../../../../../helpers/request-event.ts";

// Markers must stay on the export's timeline. Timeline here: 100 frames from 86400 → last 86499.
const snapshot = { startFrameIndex: 86400, durationFrameCount: 100 };

let w: ContentWorld;
let exp: Awaited<ReturnType<typeof f.createExport>>;

beforeEach(async () => {
	w = await contentWorld();
	exp = await f.createExport(w.tl1, { snapshot });
	signIn(w.owner.user, w.org.id);
});

const marker = (frame: number) => ({
	name: "m",
	description: "",
	frame,
	exportId: exp.id,
	categoryId: w.catA.id,
});

describe("createMarker", () => {
	it.each([86400, 86450, 86499])("accepts frame %i on the timeline", async (frame) => {
		expect((await createMarker(marker(frame))).frame).toBe(frame);
	});

	it.each([0, 86399, 86500, 999999])("400 for frame %i outside the timeline", async (frame) => {
		await expectStatus(createMarker(marker(frame)), 400);
		expect(await prisma.marker.count({ where: { exportId: exp.id } })).toBe(0);
	});

	it("a range may end on the last frame", async () => {
		// covers 86450 … 86499
		const m = await createMarker({ ...marker(86450), duration: 50 });
		expect(m).toMatchObject({ frame: 86450, duration: 50 });
	});

	it("400 for a range that runs past the end", async () => {
		await expectStatus(createMarker({ ...marker(86450), duration: 51 }), 400);
		expect(await prisma.marker.count({ where: { exportId: exp.id } })).toBe(0);
	});

	it("400 for a negative duration", async () => {
		await expectStatus(createMarker({ ...marker(86450), duration: -1 }), 400);
	});

	it("without duration it's a point marker", async () => {
		expect((await createMarker(marker(86450))).duration).toBe(0);
	});

	it("exports without a snapshot are not checked", async () => {
		const plain = await f.createExport(w.tl1);
		const m = await createMarker({ ...marker(5), exportId: plain.id });
		expect(m.frame).toBe(5);
	});
});

describe("updateMarker", () => {
	it("moving keeps the duration when it's left out", async () => {
		const m = await f.createMarker(exp, w.catA, { frame: 86410, duration: 20 });
		const res = await updateMarker({ ...marker(86420), id: m.id });
		expect(res).toMatchObject({ frame: 86420, duration: 20 });
	});

	it("400 when the kept duration would run past the end", async () => {
		const m = await f.createMarker(exp, w.catA, { frame: 86410, duration: 20 });
		await expectStatus(updateMarker({ ...marker(86490), id: m.id }), 400);
		expect(await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
			frame: 86410,
			duration: 20,
		});
	});

	it("changes the duration, 0 makes it a point marker", async () => {
		const m = await f.createMarker(exp, w.catA, { frame: 86410, duration: 20 });
		expect((await updateMarker({ ...marker(86410), id: m.id, duration: 89 })).duration).toBe(89);
		expect((await updateMarker({ ...marker(86410), id: m.id, duration: 0 })).duration).toBe(0);
	});

	it("moves a marker within the timeline", async () => {
		const m = await f.createMarker(exp, w.catA, { frame: 86410 });
		const res = await updateMarker({ ...marker(86499), id: m.id });
		expect(res.frame).toBe(86499);
	});

	it("400 when moving it past the end, and the marker stays put", async () => {
		const m = await f.createMarker(exp, w.catA, { frame: 86410 });
		await expectStatus(updateMarker({ ...marker(86500), id: m.id }), 400);
		expect((await prisma.marker.findUniqueOrThrow({ where: { id: m.id } })).frame).toBe(86410);
	});
});

describe("pasteMarkers", () => {
	async function paste(anchorFrame: number) {
		const source = await f.createExport(w.tl1);
		const a = await f.createMarker(source, w.catA, { frame: 1000 });
		const b = await f.createMarker(source, w.catA, { frame: 1030 });
		return pasteMarkers({
			sourceExportId: source.id,
			markerIds: [a.id, b.id],
			targetExportId: exp.id,
			anchorFrame,
			fallbackCategoryId: w.catA.id,
			mode: "copy",
		});
	}

	it("pastes when every marker lands on the timeline", async () => {
		expect((await paste(86469)).count).toBe(2);
		const frames = await prisma.marker.findMany({
			where: { exportId: exp.id },
			select: { frame: true },
		});
		expect(frames.map((m) => m.frame).sort()).toEqual([86469, 86499]);
	});

	it("keeps durations, and a range running past the end makes it 400", async () => {
		const source = await f.createExport(w.tl1);
		const a = await f.createMarker(source, w.catA, { frame: 1000, duration: 30 });
		const args = {
			sourceExportId: source.id,
			markerIds: [a.id],
			targetExportId: exp.id,
			fallbackCategoryId: w.catA.id,
			mode: "copy" as const,
		};

		await expectStatus(pasteMarkers({ ...args, anchorFrame: 86471 }), 400);
		await pasteMarkers({ ...args, anchorFrame: 86470 });
		const pasted = await prisma.marker.findMany({ where: { exportId: exp.id } });
		expect(pasted.map((m) => [m.frame, m.duration])).toEqual([[86470, 30]]);
	});

	it("400 and nothing pasted when the last marker would land after the end", async () => {
		await expectStatus(paste(86470), 400);
		expect(await prisma.marker.count({ where: { exportId: exp.id } })).toBe(0);
	});
});
