import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	getExport,
	getMovieBarcode,
	getProcessingJobs,
	getSeekSprites,
	getShotThumbnails,
	getUrl,
} from "#lib/components/review/export-view.remote.ts";
import {
	contentWorld,
	signInAs,
	type ContentWorld,
} from "../../../../../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../../../../../helpers/expect.ts";
import { fakes } from "../../../../../../../../../helpers/fakes.ts";
import { signIn, signOut } from "../../../../../../../../../helpers/request-event.ts";

const { MEMBER, REVIEWER } = Role;

let w: ContentWorld;
let mediaId: string;

beforeEach(async () => {
	w = await contentWorld();
	mediaId = w.exp1.mediaId!;
});

// ─── getExport ──────────────────────────────────────────────────────────────

describe("getExport", () => {
	const ids = () => ({ projectId: w.projectA.id, timelineId: w.tl1.id, exportId: w.exp1.id });

	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getExport(ids()), 401);
	});

	it("404 for another org's owner", async () => {
		signIn(w.otherOwner.user, w.org.id);
		await expectStatus(getExport(ids()), 404);
	});

	it.each([MEMBER, REVIEWER])(
		"404 for a %s without a grant, OK with a timeline grant",
		async (role) => {
			await signInAs(w.org, role, [{ timelineId: w.tl2.id }]);
			await expectStatus(getExport(ids()), 404);
			await signInAs(w.org, role, [{ timelineId: w.tl1.id }]);
			expect((await getExport(ids())).id).toBe(w.exp1.id);
		},
	);

	it("counts the markers imported from timeline data, by format", async () => {
		signIn(w.owner.user, w.org.id);
		expect((await getExport(ids())).importedMarkers).toEqual({ edl: 0, fcpxml: 0 });
		const category = await prisma.category.create({
			data: { projectId: w.projectA.id, name: "Resolve Blue", color: "#008feb" },
		});
		const marker = (nleId: string | null) => ({
			exportId: w.exp1.id,
			name: "m",
			frame: 0,
			categoryId: category.id,
			nleId,
		});
		await prisma.marker.createMany({
			data: [
				marker("cutList:edl:1"),
				marker("cutList:edl:2"),
				marker("cutList:fcpxml:3"),
				marker(null),
				marker("ptx:7"),
			],
		});
		expect((await getExport(ids())).importedMarkers).toEqual({ edl: 2, fcpxml: 1 });
	});

	it("a reviewer may import markers, a member also change the cuts", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		expect(await getExport(ids())).toMatchObject({ canImportMarkers: true, canChangeCuts: false });
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		expect(await getExport(ids())).toMatchObject({ canImportMarkers: true, canChangeCuts: true });
	});

	it("tells the team whether the cut list was used, without where it is stored", async () => {
		signIn(w.owner.user, w.org.id);
		expect((await getExport(ids())).cutList).toBeNull();

		await prisma.export.update({
			where: { id: w.exp1.id },
			data: { cutListKey: "m/cutList", cutListError: "Video 1, clip 2: 01:00:00:29 doesn't fit" },
		});
		const res = await getExport(ids());
		expect(res.cutList).toEqual({ error: "Video 1, clip 2: 01:00:00:29 doesn't fit" });
		expect(res).not.toHaveProperty("cutListKey");
		expect(res).not.toHaveProperty("cutListError");
	});

	it.each([
		["project", () => ({ projectId: w.projectB.id })],
		["timeline", () => ({ timelineId: w.tl2.id })],
	])("404 when the URL's %s doesn't match the export", async (_, over) => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getExport({ ...ids(), ...over() }), 404);
	});

	it("returns the export with media; HLS data is reduced to a flag", async () => {
		await prisma.mediaFile.update({
			where: { id: (await prisma.media.findUniqueOrThrow({ where: { id: mediaId } })).originalId },
			data: { hls: { segments: [1, 2] } },
		});
		const withHls = await prisma.mediaFile.create({
			data: { proxyOfId: mediaId, width: 1920, height: 1080, bitrate: 1, hls: { segments: [] } },
		});
		const withoutHls = await prisma.mediaFile.create({
			data: { proxyOfId: mediaId, width: 1280, height: 720, bitrate: 1 },
		});
		signIn(w.owner.user, w.org.id);

		const exp = await getExport(ids());
		expect(exp.media!.id).toBe(mediaId);
		expect(exp.media!.original).not.toHaveProperty("hls");
		const proxies = Object.fromEntries(exp.media!.proxies.map((p) => [p.id, p]));
		expect(proxies[withHls.id]).toMatchObject({ hasHls: true });
		expect(proxies[withoutHls.id]).toMatchObject({ hasHls: false });
		expect(proxies[withHls.id]).not.toHaveProperty("hls");
	});

	it("an export without media has media = null", async () => {
		signIn(w.owner.user, w.org.id);
		const exp = await getExport({ ...ids(), exportId: w.exp1b.id });
		expect(exp.media).toBeNull();
	});

	it("400 for a missing id", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getExport({ projectId: w.projectA.id, timelineId: w.tl1.id } as never), 400);
	});
});

// ─── media queries: shared access rules ─────────────────────────────────────

const mediaQueries = {
	getProcessingJobs: (id: string) => getProcessingJobs({ mediaId: id }),
	getUrl: (id: string) => getUrl({ mediaId: id, type: "original" }),
	getSeekSprites: (id: string) => getSeekSprites({ mediaId: id }),
	getShotThumbnails: (id: string) => getShotThumbnails({ mediaId: id }),
	getMovieBarcode: (id: string) => getMovieBarcode({ mediaId: id }),
};

describe.each(Object.entries(mediaQueries))("%s access", (_, run) => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(run(mediaId), 401);
	});

	it("404 for unknown media and media without an export", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(run("nope"), 404);
		const original = await prisma.mediaFile.create({ data: {} });
		const orphan = await prisma.media.create({ data: { originalId: original.id } });
		await expectStatus(run(orphan.id), 404);
	});

	it("404 for media of another org", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(run(w.otherExp.mediaId!), 404);
	});

	it("404 for a reviewer without a grant on the export's timeline", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl2.id }]);
		await expectStatus(run(mediaId), 404);
	});

	it("no S3 or queue calls when access is denied", async () => {
		signIn(w.owner.user, w.org.id);
		await run(w.otherExp.mediaId!).catch(() => {});
		expect(fakes.s3).toEqual([]);
	});
});

// ─── getProcessingJobs ──────────────────────────────────────────────────────

describe("getProcessingJobs", () => {
	const job = (name: string, state: string, extra: Record<string, unknown> = {}) => ({
		id: `${name}-${state}`,
		name,
		data: {},
		progress: 0,
		failedReason: undefined,
		getState: async () => state,
		...extra,
	});

	it("empty when there is no flow", async () => {
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		expect(await getProcessingJobs({ mediaId })).toEqual([]);
	});

	it("asks for the flow of this media and returns the child jobs", async () => {
		const asked: unknown[] = [];
		fakes.getFlow = (opts) => {
			asked.push(opts);
			return {
				job: job("setMediaProcessingDone", "waiting-children"),
				children: [{ job: job("probe", "completed", { progress: 100 }) }],
			};
		};
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		expect(await getProcessingJobs({ mediaId })).toEqual([
			{
				id: "probe-completed",
				label: "Analyze Media",
				state: "completed",
				progress: 100,
				failedReason: undefined,
				weight: 10,
			},
		]);
		expect(asked).toEqual([{ id: mediaId, queueName: "media-light" }]);
	});
});

// ─── getUrl ─────────────────────────────────────────────────────────────────

describe("getUrl", () => {
	it("presigns the object below the media's prefix", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		const url = new URL(await getUrl({ mediaId, type: "proxy", proxyId: "p1" }));
		expect(url.origin).toBe("http://fake-s3.test");
		expect(url.pathname).toBe(`/postpin-test/${mediaId}/proxy-p1`);
		expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
	});

	it("400 for an unknown type", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getUrl({ mediaId, type: "sprite" } as never), 400);
	});
});

// ─── getSeekSprites / getShotThumbnails / getMovieBarcode ──────────────────

describe("getSeekSprites", () => {
	it("404 when the media has no seek sprites yet", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getSeekSprites({ mediaId }), 404);
	});

	it("returns the sprite info and one URL per sheet", async () => {
		const sprites = {
			interval: 1,
			tileWidth: 160,
			tileHeight: 90,
			columns: 10,
			rows: 10,
			count: 150,
			sheets: 2,
		};
		await prisma.media.update({ where: { id: mediaId }, data: { seekSprites: sprites } });
		signIn(w.owner.user, w.org.id);

		const res = await getSeekSprites({ mediaId });
		expect(res.seekSprites).toEqual(sprites);
		expect(res.urls.map((u) => new URL(u).pathname)).toEqual([
			`/postpin-test/${mediaId}/sprite-0`,
			`/postpin-test/${mediaId}/sprite-1`,
		]);
	});
});

describe("getShotThumbnails", () => {
	it("404 when the media has no shot thumbnails yet", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getShotThumbnails({ mediaId }), 404);
	});

	it("returns size and one URL per thumbnail", async () => {
		await prisma.media.update({
			where: { id: mediaId },
			data: { shotThumbnails: { count: 3, width: 320, height: 180 } },
		});
		signIn(w.owner.user, w.org.id);

		const res = await getShotThumbnails({ mediaId });
		expect(res).toMatchObject({ count: 3, width: 320, height: 180 });
		expect(res.urls.map((u) => new URL(u!).pathname)).toEqual(
			[0, 1, 2].map((i) => `/postpin-test/${mediaId}/shotThumbnails-${i}`),
		);
	});

	it("while the render runs, URLs only for the shots whose image is ready", async () => {
		await prisma.media.update({
			where: { id: mediaId },
			data: { shotThumbnails: { count: 4, width: 320, height: 180, generation: "g7", ready: 2 } },
		});
		signIn(w.owner.user, w.org.id);

		const res = await getShotThumbnails({ mediaId });
		expect(res.count).toBe(4);
		expect(res.urls.map((u) => u && new URL(u).pathname)).toEqual([
			`/postpin-test/${mediaId}/shotThumbnails-g7-0`,
			`/postpin-test/${mediaId}/shotThumbnails-g7-1`,
			null,
			null,
		]);
	});

	it("points at the published generation's keys", async () => {
		await prisma.media.update({
			where: { id: mediaId },
			data: { shotThumbnails: { count: 2, width: 320, height: 180, generation: "g7" } },
		});
		signIn(w.owner.user, w.org.id);

		const res = await getShotThumbnails({ mediaId });
		expect(res.urls.map((u) => new URL(u!).pathname)).toEqual(
			[0, 1].map((i) => `/postpin-test/${mediaId}/shotThumbnails-g7-${i}`),
		);
	});
});

describe("getMovieBarcode", () => {
	it("null before processing, the stored barcode afterwards", async () => {
		signIn(w.owner.user, w.org.id);
		expect(await getMovieBarcode({ mediaId })).toBeNull();
		await prisma.media.update({
			where: { id: mediaId },
			data: { movieBarcode: { colors: ["#000"] } },
		});
		expect(await getMovieBarcode({ mediaId })).toEqual({ colors: ["#000"] });
	});
});
