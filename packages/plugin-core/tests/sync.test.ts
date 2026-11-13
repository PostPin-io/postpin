import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOLVE_CAPABILITIES, fakeNle } from "./fakes.ts";
import type { Capabilities, NleMarker } from "../src/bridge.ts";

const api = vi.hoisted(() => ({
	getMarkers: vi.fn(),
	uploadMarkers: vi.fn(),
	getCategories: vi.fn(),
	createCategory: vi.fn(),
}));
vi.mock("@postpin-io/api-client-ts", () => api);

import { syncMarkersDown, syncMarkersUp } from "../src/sync.ts";
import type { Client } from "@postpin-io/api-client-ts/client";

type Category = { id: string; name: string; color: string };
type ServerMarker = {
	id: string;
	nleId: string | null;
	name: string;
	description: string | null;
	frame: number;
	duration: number;
	categoryId: string;
};

const client = {} as Client;
const ids = { projectId: "p1", timelineId: "t1", exportId: "e1" };
const exportPath = { path: ids };

let categories: Category[];
let serverMarkers: ServerMarker[];

const nleMarker = (overrides: Partial<NleMarker>): NleMarker => ({
	nleId: "n1",
	title: "Marker",
	description: "",
	frame: 100,
	color: "Blue",
	customData: null,
	...overrides,
});

/** The marker list of the n-th uploadMarkers call */
const uploaded = (call = 0) => api.uploadMarkers.mock.calls[call]![0].body;

beforeEach(() => {
	categories = [
		{ id: "c-vfx", name: "VFX", color: "#FF0000" },
		{ id: "c-blue", name: "Resolve Blue", color: "#0000FF" },
	];
	serverMarkers = [];
	let nextCategory = 1;
	for (const fn of Object.values(api)) fn.mockReset();
	// a fresh copy each call, like a real response
	api.getCategories.mockImplementation(async () => ({ data: categories.map((c) => ({ ...c })) }));
	api.createCategory.mockImplementation(async ({ body }) => {
		const category = { id: `c-new-${nextCategory++}`, ...body };
		categories.push(category);
		return { data: category };
	});
	api.getMarkers.mockImplementation(async () => ({ data: serverMarkers }));
	api.uploadMarkers.mockResolvedValue({ data: undefined });
});

describe("syncMarkersUp", () => {
	it("uploads tagged markers into their category without the tag", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({
				nleId: "n1",
				title: "Sky",
				description: "#VFX\n\nFix the sky",
				frame: 86400,
				color: "Green",
			}),
		]);
		await syncMarkersUp({ nle, client, ...ids });

		expect(api.getCategories).toHaveBeenCalledWith({
			client,
			path: { projectId: "p1" },
			throwOnError: true,
		});
		expect(api.createCategory).not.toHaveBeenCalled();
		expect(api.uploadMarkers).toHaveBeenCalledWith({
			client,
			...exportPath,
			throwOnError: true,
			body: [
				{
					name: "Sky",
					description: "Fix the sky",
					frame: 86400,
					categoryId: "c-vfx",
					nleId: "n1",
					id: undefined,
				},
			],
		});
	});

	it("puts untagged markers into the existing category named after host and color", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ description: "note", color: "Blue" })]);
		await syncMarkersUp({ nle, client, ...ids });
		expect(uploaded()[0]).toMatchObject({ categoryId: "c-blue", description: "note" });
		expect(api.createCategory).not.toHaveBeenCalled();
	});

	it("creates a missing category once, with the marker's color, and reuses it", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", color: "Red" }),
			nleMarker({ nleId: "n2", color: "Red" }),
			nleMarker({ nleId: "n3", description: "#Sound\n\nhum" }),
			nleMarker({ nleId: "n4", description: "#Sound" }),
		]);
		await syncMarkersUp({ nle, client, ...ids });

		expect(api.createCategory.mock.calls.map(([args]) => args.body)).toEqual([
			{ name: "Resolve Red", color: "#FF0000" },
			// a tagged marker's new category takes the marker's color
			{ name: "Sound", color: "#0000FF" },
		]);
		expect(api.createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ client, path: { projectId: "p1" }, throwOnError: true }),
		);
		expect(uploaded().map((m: { categoryId: string }) => m.categoryId)).toEqual([
			"c-new-1",
			"c-new-1",
			"c-new-2",
			"c-new-2",
		]);
	});

	it("uses the palette's display name for color categories (Pro Tools indices)", async () => {
		const proTools: Capabilities = {
			...RESOLVE_CAPABILITIES,
			hostName: "Pro Tools",
			palette: [{ id: "7", hex: "#00FF00", name: "Green" }],
		};
		await syncMarkersUp({ nle: fakeNle(proTools, [nleMarker({ color: "7" })]), client, ...ids });
		expect(api.createCategory.mock.calls[0]![0].body).toEqual({
			name: "Pro Tools Green",
			color: "#00FF00",
		});
	});

	it("names color categories after the hex color on rgb hosts", async () => {
		const reaper: Capabilities = { ...RESOLVE_CAPABILITIES, hostName: "Reaper", palette: "rgb" };
		await syncMarkersUp({
			nle: fakeNle(reaper, [nleMarker({ color: "#123456" })]),
			client,
			...ids,
		});
		expect(api.createCategory.mock.calls[0]![0].body).toEqual({
			name: "Reaper #123456",
			color: "#123456",
		});
	});

	it("uses the color id and the default color for colors missing from the palette", async () => {
		await syncMarkersUp({
			nle: fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ color: "Fuchsia" })]),
			client,
			...ids,
		});
		expect(api.createCategory.mock.calls[0]![0].body).toEqual({
			name: "Resolve Fuchsia",
			color: "#3B82F6",
		});
	});

	it("sends the PostPin id of markers pulled from PostPin, and nothing for foreign custom data", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "n1", customData: '{"__postpin":1,"id":"pp-1"}' }),
			nleMarker({ nleId: "n2", customData: '{"__postpin":true,"id":"pp-2"}' }),
			nleMarker({ nleId: "n3", customData: '{"id":"other-tool"}' }),
			nleMarker({ nleId: "n4", customData: "free text" }),
		]);
		await syncMarkersUp({ nle, client, ...ids });
		expect(uploaded().map((m: { id?: string }) => m.id)).toEqual([
			"pp-1",
			"pp-2",
			undefined,
			undefined,
		]);
	});

	it("uploads an empty list for a timeline without markers", async () => {
		await syncMarkersUp({ nle: fakeNle(), client, ...ids });
		expect(uploaded()).toEqual([]);
	});

	it("does not upload when loading the categories fails", async () => {
		api.getCategories.mockRejectedValue({ message: "Forbidden" });
		await expect(
			syncMarkersUp({ nle: fakeNle(RESOLVE_CAPABILITIES, [nleMarker({})]), client, ...ids }),
		).rejects.toEqual({
			message: "Forbidden",
		});
		expect(api.uploadMarkers).not.toHaveBeenCalled();
	});
});

describe("syncMarkersUp: ranges", () => {
	it("uploads each marker's duration", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [
			nleMarker({ nleId: "range", duration: 48 }),
			nleMarker({ nleId: "point", duration: 0 }),
		]);
		await syncMarkersUp({ nle, client, ...ids });
		expect(
			uploaded().map((m: { nleId: string; duration?: number }) => [m.nleId, m.duration]),
		).toEqual([
			["range", 48],
			["point", 0],
		]);
	});

	it("leaves the duration out when the adapter doesn't know it, so PostPin keeps its own", async () => {
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ nleId: "n1" })]);
		await syncMarkersUp({ nle, client, ...ids });
		expect(uploaded()[0].duration).toBeUndefined();
	});
});

describe("syncMarkersDown", () => {
	const serverMarker = (overrides: Partial<ServerMarker>): ServerMarker => ({
		id: "pp-1",
		nleId: null,
		name: "Marker",
		description: "text",
		frame: 100,
		duration: 0,
		categoryId: "c-vfx",
		...overrides,
	});

	it("loads markers and categories of the export", async () => {
		await syncMarkersDown({ nle: fakeNle(), client, ...ids });
		expect(api.getMarkers).toHaveBeenCalledWith({ client, ...exportPath, throwOnError: true });
		expect(api.getCategories).toHaveBeenCalledWith({
			client,
			path: { projectId: "p1" },
			throwOnError: true,
		});
	});

	it("writes markers with a category tag, the closest color and PostPin's custom data", async () => {
		serverMarkers = [
			serverMarker({
				id: "pp-1",
				name: "Sky",
				description: "Fix it",
				frame: 86400,
				categoryId: "c-vfx",
			}),
		];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(nle.setMarkers).toHaveBeenCalledWith([
			{
				nleId: null,
				title: "Sky",
				description: "#VFX\n\nFix it",
				frame: 86400,
				duration: 0,
				color: "Red",
				customData: '{"__postpin":1,"id":"pp-1"}',
			},
		]);
	});

	it("writes no tag for categories named after their host color", async () => {
		serverMarkers = [serverMarker({ categoryId: "c-blue", description: "plain" })];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(nle.setMarkers.mock.calls[0]![0][0]).toMatchObject({
			description: "plain",
			color: "Blue",
		});
	});

	it("tags a color-named category whose color doesn't match its name", async () => {
		categories.push({ id: "c-odd", name: "Resolve Green", color: "#FF0000" });
		serverMarkers = [serverMarker({ categoryId: "c-odd", description: null })];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(nle.setMarkers.mock.calls[0]![0][0]).toMatchObject({
			description: "#Resolve Green",
			color: "Red",
		});
	});

	it("uses the default color and no tag for markers of unknown categories", async () => {
		serverMarkers = [serverMarker({ categoryId: "gone", description: null })];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		// the default #3B82F6 is closest to Blue
		expect(nle.setMarkers.mock.calls[0]![0][0]).toMatchObject({ description: "", color: "Blue" });
	});

	it("keeps hex colors on rgb hosts and tags only non-color categories", async () => {
		const reaper: Capabilities = { ...RESOLVE_CAPABILITIES, hostName: "Reaper", palette: "rgb" };
		categories.push({ id: "c-rgb", name: "Reaper #00FF00", color: "#00FF00" });
		serverMarkers = [
			serverMarker({ id: "a", categoryId: "c-vfx" }),
			serverMarker({ id: "b", categoryId: "c-rgb" }),
		];
		const nle = fakeNle(reaper);
		await syncMarkersDown({ nle, client, ...ids });
		expect(
			nle.setMarkers.mock.calls[0]![0].map((m: NleMarker) => [m.color, m.description]),
		).toEqual([
			["#FF0000", "#VFX\n\ntext"],
			["#00FF00", "text"],
		]);
	});

	it("links new NLE markers back to PostPin, but not markers it already knew", async () => {
		serverMarkers = [
			serverMarker({ id: "pp-known", nleId: "n-known", name: "Known" }),
			serverMarker({
				id: "pp-new",
				nleId: null,
				name: "New",
				description: null,
				frame: 5,
				categoryId: "c-blue",
			}),
		];
		const nle = fakeNle(RESOLVE_CAPABILITIES, [nleMarker({ nleId: "n-known" })]);
		await syncMarkersDown({ nle, client, ...ids });

		expect(api.uploadMarkers).toHaveBeenCalledOnce();
		expect(api.uploadMarkers).toHaveBeenCalledWith({
			client,
			...exportPath,
			throwOnError: true,
			body: [
				{
					id: "pp-new",
					nleId: "nle-1",
					name: "New",
					description: null,
					frame: 5,
					duration: 0,
					categoryId: "c-blue",
				},
			],
		});
	});

	it("links a marker whose NLE marker was replaced by a new one", async () => {
		serverMarkers = [serverMarker({ id: "pp-1", nleId: "n-deleted" })];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(uploaded()).toMatchObject([{ id: "pp-1", nleId: "nle-1" }]);
	});

	it("does not upload when every marker kept its NLE id or got none", async () => {
		serverMarkers = [
			serverMarker({ id: "a", nleId: "n1" }),
			serverMarker({ id: "b", nleId: null }),
		];
		const nle = fakeNle();
		nle.setMarkers.mockResolvedValue(["n1", ""]);
		await syncMarkersDown({ nle, client, ...ids });
		expect(api.uploadMarkers).not.toHaveBeenCalled();
	});

	it("does not link anything when writing to the NLE fails", async () => {
		serverMarkers = [serverMarker({})];
		const nle = fakeNle();
		nle.setMarkers.mockRejectedValue(new Error("2 markers could not be written"));
		await expect(syncMarkersDown({ nle, client, ...ids })).rejects.toThrow("could not be written");
		expect(api.uploadMarkers).not.toHaveBeenCalled();
	});
});

describe("round trip", () => {
	it("pushes pulled markers back into the same categories with their PostPin ids", async () => {
		categories.push({ id: "c-sound", name: "Sound", color: "#00FF00" });
		serverMarkers = [
			{
				id: "pp-1",
				nleId: null,
				name: "Sky",
				description: "Fix it",
				frame: 10,
				categoryId: "c-vfx",
			},
			{
				id: "pp-2",
				nleId: null,
				name: "Note",
				description: "plain",
				frame: 20,
				categoryId: "c-blue",
			},
			{
				id: "pp-3",
				nleId: null,
				name: "Hum",
				description: "Line 1\n\nLine 2",
				frame: 30,
				categoryId: "c-sound",
			},
		];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		api.uploadMarkers.mockClear();

		await syncMarkersUp({ nle, client, ...ids });
		expect(api.createCategory).not.toHaveBeenCalled();
		expect(uploaded()).toEqual([
			{
				id: "pp-1",
				nleId: "nle-1",
				name: "Sky",
				description: "Fix it",
				frame: 10,
				categoryId: "c-vfx",
			},
			{
				id: "pp-2",
				nleId: "nle-2",
				name: "Note",
				description: "plain",
				frame: 20,
				categoryId: "c-blue",
			},
			{
				id: "pp-3",
				nleId: "nle-3",
				name: "Hum",
				description: "Line 1\n\nLine 2",
				frame: 30,
				categoryId: "c-sound",
			},
		]);
	});
});

describe("syncMarkersDown: ranges", () => {
	const serverMarker = (overrides: Partial<ServerMarker>): ServerMarker => ({
		id: "pp-1",
		nleId: null,
		name: "Marker",
		description: "text",
		frame: 100,
		duration: 0,
		categoryId: "c-vfx",
		...overrides,
	});

	it("writes the duration into the NLE", async () => {
		serverMarkers = [
			serverMarker({ id: "pp-range", duration: 24 }),
			serverMarker({ id: "pp-point", frame: 200 }),
		];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(nle.setMarkers.mock.calls[0]![0].map((m: NleMarker) => m.duration)).toEqual([24, 0]);
	});

	it("keeps the duration when linking new NLE markers back to PostPin", async () => {
		serverMarkers = [serverMarker({ id: "pp-range", duration: 24 })];
		const nle = fakeNle();
		await syncMarkersDown({ nle, client, ...ids });
		expect(uploaded()).toEqual([expect.objectContaining({ id: "pp-range", duration: 24 })]);
	});
});
