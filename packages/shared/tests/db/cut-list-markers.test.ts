import { describe, expect, it, vi } from "vitest";
import {
	cutListMarkerId,
	importedMarkerCounts,
	saveCutListMarkers,
} from "../../src/db/cut-list-markers.ts";
import type { PlacedMarker } from "../../src/logic/web-upload.ts";

const marker = (over: Partial<PlacedMarker> = {}): PlacedMarker => ({
	index: 0,
	name: "Fix",
	description: "too warm",
	frame: 90025,
	duration: 0,
	category: { name: "Resolve Blue", color: "#008feb" },
	...over,
});

describe("cutListMarkerId", () => {
	it("the same for the same marker, wherever it is in the list", () => {
		expect(cutListMarkerId(marker(), "edl")).toBe(cutListMarkerId(marker({ index: 7 }), "edl"));
		expect(cutListMarkerId(marker(), "edl")).toMatch(/^cutList:edl:[0-9a-f]{8}$/);
	});

	it("another for the same marker from another format", () => {
		expect(cutListMarkerId(marker(), "fcpxml")).not.toBe(cutListMarkerId(marker(), "edl"));
		expect(cutListMarkerId(marker(), "fcpxml")).toMatch(/^cutList:fcpxml:/);
	});

	it.each([
		["frame", { frame: 90026 }],
		["length", { duration: 5 }],
		["category", { category: { name: "Resolve Red", color: "#fc0000" } }],
		["name", { name: "Fix it" }],
		["note", { description: null }],
	])("another for another %s", (_, over) => {
		expect(cutListMarkerId(marker(over), "edl")).not.toBe(cutListMarkerId(marker(), "edl"));
	});
});

describe("saveCutListMarkers", () => {
	const db = () => ({
		category: {
			upsert: vi.fn(async ({ create }: { create: { name: string } }) => ({
				id: `cat-${create.name}`,
			})),
		},
		marker: {
			createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
		},
	});

	it("one category per color, the markers in them, skipping those that are there", async () => {
		const d = db();
		const count = await saveCutListMarkers(d as never, {
			exportId: "e1",
			projectId: "p1",
			authorId: "u1",
			format: "edl",
			markers: [
				marker(),
				marker({ frame: 90050, category: { name: "Resolve Red", color: "#fc0000" } }),
				marker({ frame: 90075 }),
			],
		});
		expect(count).toBe(3);
		expect(d.category.upsert).toHaveBeenCalledTimes(2);
		expect(d.category.upsert.mock.calls[0]![0]).toEqual({
			where: { projectId_name: { projectId: "p1", name: "Resolve Blue" } },
			create: { projectId: "p1", name: "Resolve Blue", color: "#008feb", createdById: "u1" },
			update: {},
			select: { id: true },
		});
		const { data, skipDuplicates } = d.marker.createMany.mock.calls[0]![0] as {
			data: { categoryId: string; nleId: string; authorId: string }[];
			skipDuplicates: boolean;
		};
		expect(skipDuplicates).toBe(true);
		expect(data.map((m) => m.categoryId)).toEqual([
			"cat-Resolve Blue",
			"cat-Resolve Red",
			"cat-Resolve Blue",
		]);
		expect(data[0]).toMatchObject({
			exportId: "e1",
			nleId: cutListMarkerId(marker(), "edl"),
			authorId: "u1",
		});
	});

	it("nothing to do without markers", async () => {
		const d = db();
		expect(
			await saveCutListMarkers(d as never, {
				exportId: "e1",
				projectId: "p1",
				authorId: null,
				markers: [],
			}),
		).toBe(0);
		expect(d.marker.createMany).not.toHaveBeenCalled();
	});
});

describe("importedMarkerCounts", () => {
	it("counts the export's markers by the format in their nleId", async () => {
		const count = vi.fn(async ({ where }: { where: { nleId: { startsWith: string } } }) =>
			where.nleId.startsWith === "cutList:edl:" ? 3 : 0,
		);
		expect(await importedMarkerCounts({ marker: { count } } as never, "e1")).toEqual({
			edl: 3,
			fcpxml: 0,
		});
		expect(count).toHaveBeenCalledWith({
			where: { exportId: "e1", nleId: { startsWith: "cutList:edl:" } },
		});
	});
});
