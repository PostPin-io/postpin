import { beforeEach, describe, expect, it } from "vitest";
import type { HlsInfo } from "@postpin-io/shared/types/HlsIndex";
import {
	getExport,
	getMovieBarcode,
	getSeekSprites,
	getShotThumbnails,
	getUrl,
} from "#lib/components/review/export-view.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { GET as masterGET } from "../../../../src/routes/media/[media]/master.m3u8/+server.ts";
import { GET as renditionGET } from "../../../../src/routes/media/[media]/[file].m3u8/+server.ts";
import { fakeCookies, type FakeCookies } from "../../../helpers/cookies.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { signIn, useCookies } from "../../../helpers/request-event.ts";

/**
 * Share-link guests read an export through the team's own functions, with `shareToken`
 * (see review-access.ts). These tests cover what a guest gets there, and what not.
 */

const hls: HlsInfo = {
	init: { offset: 0, length: 800 },
	segments: [{ duration: 6, offset: 800, length: 750_000 }],
};
const snapshot = {
	id: "tl",
	name: "Cut 3",
	tracks: [{ id: "v1" }],
	mediaItems: [{ id: "m1" }],
	frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
	startFrameIndex: 1000,
	durationFrameCount: 500,
	metadata: { editor: "x" },
};

const proxy = (mediaId: string) =>
	prisma.mediaFile.create({
		data: {
			proxyOfId: mediaId,
			status: "COMPLETED",
			width: 1280,
			height: 720,
			size: BigInt(2_000_000),
			duration: 6,
			codecs: "avc1.64002a,mp4a.40.2",
			hls: hls as object,
		},
	});

let link: Awaited<ReturnType<typeof f.createShareLink>>;
let exportId: string;
let mediaId: string;
let fileId: string;
let otherExportId: string;
let otherMediaId: string;
let otherFileId: string;
let cookies: FakeCookies;

beforeEach(async () => {
	const project = await f.createProject(await f.createOrg());
	const tl = await f.createTimeline(project);
	const exp = await f.createExport(tl, { media: true });
	await prisma.export.update({ where: { id: exp.id }, data: { timelineSnapshot: snapshot } });
	exportId = exp.id;
	mediaId = exp.mediaId!;
	await prisma.media.update({
		where: { id: mediaId },
		data: {
			status: "COMPLETED",
			shotThumbnails: { count: 1, width: 160, height: 90 },
			seekSprites: {
				interval: 1,
				tileWidth: 160,
				tileHeight: 90,
				columns: 10,
				rows: 10,
				count: 100,
				sheets: 1,
			},
		},
	});
	fileId = (await proxy(mediaId)).id;

	const other = await f.createExport(tl, { media: true });
	otherExportId = other.id;
	otherMediaId = other.mediaId!;
	otherFileId = (await proxy(otherMediaId)).id;

	link = await f.createShareLink(exp, { expiresAt: new Date(Date.now() + 2 * 3600 * 1000) });
	cookies = fakeCookies().cookies;
	await createShareGuest(cookies, link, "Anna");
	useCookies(cookies);
});

const as = () => ({ shareToken: link.token });
const expiresIn = (url: string) => Number(new URL(url).searchParams.get("X-Amz-Expires"));
const playlistEvent = (params: Record<string, string>, token = link.token) =>
	({ params, url: new URL(`http://localhost/?share=${token}`) }) as never;
const master = async (params: Record<string, string>) => await masterGET(playlistEvent(params));
const rendition = async (params: Record<string, string>) =>
	await renditionGET(playlistEvent(params));

describe("getExport as guest", () => {
	it("without the timeline panel: timing yes, clips no", async () => {
		expect((await getExport({ exportId, ...as() })).timelineSnapshot).toEqual({
			...snapshot,
			name: "",
			tracks: [],
			mediaItems: [],
			metadata: {},
		});
	});

	it("with the timeline panel: the full snapshot", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { timelinePanelVisible: true } });
		expect((await getExport({ exportId, ...as() })).timelineSnapshot).toEqual(snapshot);
	});

	it("404 for another export with this link's token", async () => {
		await expectStatus(getExport({ exportId: otherExportId, ...as() }), 404);
	});

	it("401 without the guest cookie, 410 once the link is revoked", async () => {
		useCookies(fakeCookies().cookies);
		await expectStatus(getExport({ exportId, ...as() }), 401);
		useCookies(cookies);
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		await expectStatus(getExport({ exportId, ...as() }), 410);
	});

	it("the token wins over a signed-in session: still the guest view", async () => {
		signIn(await f.createUser());
		expect((await getExport({ exportId, ...as() })).timelineSnapshot).toMatchObject({
			tracks: [],
		});
	});

	it("without a token a signed-out visitor gets nothing, even with a guest cookie", async () => {
		await expectStatus(getExport({ exportId }), 401);
	});
});

describe("media as guest", () => {
	it("thumbnail yes (never past the link), original and proxy no", async () => {
		expect(expiresIn(await getUrl({ mediaId, type: "thumbnail", ...as() }))).toBeLessThanOrEqual(
			2 * 3600,
		);
		await expectStatus(getUrl({ mediaId, type: "original", ...as() }), 403);
		await expectStatus(getUrl({ mediaId, type: "proxy", proxyId: fileId, ...as() }), 403);
	});

	it("seek sprites, signed for at most the link's lifetime", async () => {
		const { urls } = await getSeekSprites({ mediaId, ...as() });
		expect(urls).toHaveLength(1);
		expect(expiresIn(urls[0]!)).toBeLessThanOrEqual(2 * 3600);
	});

	it("404 for another export's media", async () => {
		await expectStatus(getUrl({ mediaId: otherMediaId, type: "thumbnail", ...as() }), 404);
		await expectStatus(getSeekSprites({ mediaId: otherMediaId, ...as() }), 404);
	});

	it("shot thumbnails and barcode only with the timeline panel", async () => {
		await expectStatus(getShotThumbnails({ mediaId, ...as() }), 403);
		await expectStatus(getMovieBarcode({ mediaId, ...as() }), 403);
		await prisma.shareLink.update({ where: { id: link.id }, data: { timelinePanelVisible: true } });
		expect((await getShotThumbnails({ mediaId, ...as() })).urls).toHaveLength(1);
		expect(await getMovieBarcode({ mediaId, ...as() })).toBeNull();
	});
});

describe("playlists as guest", () => {
	it("master lists the renditions with the token on each URI", async () => {
		const text = await (await master({ media: mediaId })).text();
		expect(text).toContain(`\n${fileId}.m3u8?share=${encodeURIComponent(link.token)}\n`);
	});

	it("screening guests only get the smallest rendition, also when asking by id", async () => {
		const small = await prisma.mediaFile.create({
			data: {
				proxyOfId: mediaId,
				status: "COMPLETED",
				width: 640,
				height: 360,
				size: BigInt(500_000),
				duration: 6,
				codecs: "avc1.64001e,mp4a.40.2",
				hls: hls as object,
			},
		});
		// other guests choose between both
		expect(await (await master({ media: mediaId })).text()).toContain(`${fileId}.m3u8`);

		await prisma.shareLink.update({ where: { id: link.id }, data: { kind: "SCREENING" } });
		const text = await (await master({ media: mediaId })).text();
		expect(text).toContain(`${small.id}.m3u8`);
		expect(text).not.toContain(`${fileId}.m3u8`);
		expect((await rendition({ media: mediaId, file: small.id })).status).toBe(200);
		await expectStatus(rendition({ media: mediaId, file: fileId }), 404);
	});

	it("rendition URLs never outlive the link", async () => {
		const text = await (await rendition({ media: mediaId, file: fileId })).text();
		expect(expiresIn(text.match(/URI="([^"]+)"/)![1]!)).toBeLessThanOrEqual(2 * 3600);
	});

	it("404 for another export's media or a foreign proxy", async () => {
		await expectStatus(master({ media: otherMediaId }), 404);
		await expectStatus(rendition({ media: mediaId, file: otherFileId }), 404);
	});

	it("401 without the guest cookie, 410 once the link expired", async () => {
		useCookies(fakeCookies().cookies);
		await expectStatus(master({ media: mediaId }), 401);
		useCookies(cookies);
		await prisma.shareLink.update({
			where: { id: link.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		await expectStatus(rendition({ media: mediaId, file: fileId }), 410);
	});
});
