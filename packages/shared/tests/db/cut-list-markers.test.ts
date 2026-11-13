import { describe, expect, it, vi } from "vitest";
import { cutListMarkerId, saveCutListMarkers } from "../../src/db/cut-list-markers.ts";
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
		expect(cutListMarkerId(marker())).toBe(cutListMarkerId(marker({ index: 7 })));
		expect(cutListMarkerId(marker())).toMatch(/^cutList:[0-9a-f]{8}$/);
	});

	it.each([
		["frame", { frame: 90026 }],
		["length", { duration: 5 }],
		["category", { category: { name: "Resolve Red", color: "#fc0000" } }],
		["name", { name: "Fix it" }],
		["note", { description: null }],
	])("another for another %s", (_, over) => {
		expect(cutListMarkerId(marker(over))).not.toBe(cutListMarkerId(marker()));
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
			nleId: cutListMarkerId(marker()),
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
