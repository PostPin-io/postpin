import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import type { HlsInfo } from "@postpin-io/shared/types/HlsIndex";
import { GET as masterGET } from "../../../../src/routes/media/[media]/master.m3u8/+server.ts";
import { GET as renditionGET } from "../../../../src/routes/media/[media]/[file].m3u8/+server.ts";
import { prisma } from "../../../helpers/db.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";
import { signIn, signOut } from "../../../helpers/request-event.ts";

/** HLS playlists under /media/[media]/: gated by requireMediaAccess, built from the proxies' hls info */

const { OWNER, MEMBER, REVIEWER } = Role;

const hls: HlsInfo = {
	init: { offset: 0, length: 800 },
	segments: [
		{ duration: 6, offset: 800, length: 750_000 },
		{ duration: 4.5, offset: 750_800, length: 300_000 },
	],
};

let org: { id: string };
let tl1: { id: string; projectId: string };
let tl2: { id: string };
let mediaId: string;

async function proxy(
	media: string,
	data: { height: number; status?: "COMPLETED" | "PROCESSING"; hls?: HlsInfo | null },
) {
	return prisma.mediaFile.create({
		data: {
			proxyOfId: media,
			status: data.status ?? "COMPLETED",
			width: Math.round((data.height * 16) / 9),
			height: data.height,
			size: BigInt(2_000_000),
			duration: 10,
			codecs: "avc1.64002a,mp4a.40.2",
			hls: data.hls === null ? undefined : ((data.hls ?? hls) as object),
		},
	});
}

beforeEach(async () => {
	org = await f.createOrg();
	const project = await f.createProject(org);
	tl1 = await f.createTimeline(project);
	tl2 = await f.createTimeline(project);
	const exp = await f.createExport(tl1, { media: true });
	mediaId = exp.mediaId!;
	const media = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
	await prisma.mediaFile.update({ where: { id: media.originalId }, data: { frameRate: 25 } });
});

async function as(role: Role, grantOn?: { projectId: string } | { timelineId: string }) {
	const m = await f.createMember(org, role);
	if (grantOn) await f.grant(m, grantOn);
	signIn(m.user, org.id);
	return m;
}

const params = (p: Record<string, string>) =>
	({ params: p, url: new URL("http://localhost/") }) as never;
// the handlers return MaybePromise<Response>; always a promise here
const master = async (event: never) => await masterGET(event);
const rendition = async (event: never) => await renditionGET(event);

// ─── access ─────────────────────────────────────────────────────────────────

describe.each([
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	["master.m3u8", (media: string, _file: string) => master(params({ media }))],
	["[file].m3u8", (media: string, file: string) => rendition(params({ media, file }))],
] as const)("%s access", (_, get) => {
	let fileId: string;
	beforeEach(async () => {
		fileId = (await proxy(mediaId, { height: 720 })).id;
	});

	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(get(mediaId, fileId), 401);
	});

	it("404 for media that belongs to no export", async () => {
		await as(OWNER);
		const orphan = await prisma.media.create({ data: { original: { create: {} } } });
		await proxy(orphan.id, { height: 720 });
		await expectStatus(get(orphan.id, fileId), 404);
	});

	it("404 for a timeline outside the reviewer's grants", async () => {
		await as(REVIEWER, { timelineId: tl2.id });
		await expectStatus(get(mediaId, fileId), 404);
	});

	it("404 for a member of another org", async () => {
		const other = await f.createOrg();
		const m = await f.createMember(other, OWNER);
		signIn(m.user, other.id);
		await expectStatus(get(mediaId, fileId), 404);
	});

	it.each([
		[REVIEWER, "timeline"],
		[MEMBER, "project"],
	] as const)("%s with a %s grant gets the playlist", async (role, kind) => {
		await as(role, kind === "timeline" ? { timelineId: tl1.id } : { projectId: tl1.projectId });
		const res = await get(mediaId, fileId);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
		expect(res.headers.get("cache-control")).toBe("private, no-store");
	});
});

// ─── master.m3u8 ────────────────────────────────────────────────────────────

describe("master.m3u8", () => {
	it("lists completed renditions with hls info, highest first", async () => {
		const p480 = await proxy(mediaId, { height: 480 });
		const p1080 = await proxy(mediaId, { height: 1080 });
		await proxy(mediaId, { height: 720, status: "PROCESSING" });
		await proxy(mediaId, { height: 360, hls: null });
		await as(OWNER);

		const text = await (await master(params({ media: mediaId }))).text();
		// peak = 750000 B * 8 / 6 s, average = 2000000 B * 8 / 10 s
		expect(text).toBe(
			[
				"#EXTM3U",
				"#EXT-X-VERSION:7",
				"#EXT-X-INDEPENDENT-SEGMENTS",
				`#EXT-X-STREAM-INF:BANDWIDTH=1000000,AVERAGE-BANDWIDTH=1600000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2",FRAME-RATE=25.000`,
				`${p1080.id}.m3u8`,
				`#EXT-X-STREAM-INF:BANDWIDTH=1000000,AVERAGE-BANDWIDTH=1600000,RESOLUTION=853x480,CODECS="avc1.64002a,mp4a.40.2",FRAME-RATE=25.000`,
				`${p480.id}.m3u8`,
				"",
			].join("\n"),
		);
	});

	it("leaves out FRAME-RATE when the original wasn't probed", async () => {
		const media = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
		await prisma.mediaFile.update({ where: { id: media.originalId }, data: { frameRate: null } });
		await proxy(mediaId, { height: 720 });
		await as(OWNER);
		const text = await (await master(params({ media: mediaId }))).text();
		expect(text).toContain("RESOLUTION=1280x720");
		expect(text).not.toContain("FRAME-RATE");
	});

	it("404 while no rendition is ready", async () => {
		await proxy(mediaId, { height: 720, status: "PROCESSING" });
		await as(OWNER);
		await expectStatus(master(params({ media: mediaId })), 404);
	});
});

// ─── [file].m3u8 ────────────────────────────────────────────────────────────

describe("[file].m3u8", () => {
	it("is a VOD playlist of byte ranges in one presigned proxy file", async () => {
		const file = await proxy(mediaId, { height: 720 });
		await as(OWNER);
		const text = await (await rendition(params({ media: mediaId, file: file.id }))).text();
		const lines = text.trimEnd().split("\n");

		expect(lines.slice(0, 5)).toEqual([
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-PLAYLIST-TYPE:VOD",
			"#EXT-X-INDEPENDENT-SEGMENTS",
			"#EXT-X-TARGETDURATION:6",
		]);
		const url = lines[5]!.match(/^#EXT-X-MAP:URI="([^"]+)",BYTERANGE="800@0"$/)![1]!;
		expect(lines.slice(6)).toEqual([
			"#EXTINF:6.000000,",
			"#EXT-X-BYTERANGE:750000@800",
			url,
			"#EXTINF:4.500000,",
			"#EXT-X-BYTERANGE:300000@750800",
			url,
			"#EXT-X-ENDLIST",
		]);

		const signed = new URL(url);
		expect(signed.origin).toBe("http://fake-s3.test");
		expect(signed.pathname).toBe(`/postpin-test/${mediaId}/proxy-${file.id}`);
		expect(signed.searchParams.get("X-Amz-Expires")).toBe(String(12 * 60 * 60));
		expect(signed.searchParams.get("X-Amz-Signature")).toBeTruthy();
	});

	it("404 for a rendition that isn't finished", async () => {
		const file = await proxy(mediaId, { height: 720, status: "PROCESSING" });
		await as(OWNER);
		await expectStatus(rendition(params({ media: mediaId, file: file.id })), 404);
	});

	it("404 for a rendition without hls info", async () => {
		const file = await proxy(mediaId, { height: 720, hls: null });
		await as(OWNER);
		await expectStatus(rendition(params({ media: mediaId, file: file.id })), 404);
	});

	it("404 for a rendition of other media, even if that media is accessible", async () => {
		const otherExp = await f.createExport(tl1, { media: true });
		const foreign = await proxy(otherExp.mediaId!, { height: 720 });
		await as(OWNER);
		await expectStatus(rendition(params({ media: mediaId, file: foreign.id })), 404);
	});

	it("can't reach a rendition of inaccessible media through accessible media", async () => {
		const exp2 = await f.createExport(tl2, { media: true });
		const hidden = await proxy(exp2.mediaId!, { height: 720 });
		await as(REVIEWER, { timelineId: tl1.id });
		await expectStatus(rendition(params({ media: mediaId, file: hidden.id })), 404);
		await expectStatus(rendition(params({ media: exp2.mediaId!, file: hidden.id })), 404);
	});
});
