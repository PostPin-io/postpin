import { beforeEach, describe, expect, it, vi } from "vitest";
import { WaitingChildrenError } from "bullmq";
import { fakeJob } from "../helpers.ts";
import { ffmpegLib, prisma, resetMocks, sharedStorage } from "./mocks.ts";

const queue = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("../../src/lib/ffmpeg.ts", async () => (await import("./mocks.ts")).ffmpegLib);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);
vi.mock("@postpin-io/shared/queue", async (importOriginal) => ({
	...(await importOriginal<typeof import("@postpin-io/shared/queue")>()),
	getQueue: () => queue,
}));

import { verifyProxies } from "../../src/handlers/verifyProxies.ts";

/** Rows as complete-upload stores the plugin's proxies */
const proxies = [
	{ id: "p720", width: 1280, height: 720, size: 2000n, duration: 10, audioCodec: "aac" },
	{ id: "p480", width: 854, height: 480, size: 1000n, duration: 10, audioCodec: "aac" },
];
/** What ffprobe reports for a proxy that checks out */
const goodProbe = (width: number, height: number, size: number, extra: object = {}) => ({
	streams: [
		{
			codec_type: "video",
			codec_name: "h264",
			profile: "High",
			level: 42,
			pix_fmt: "yuv420p",
			width,
			height,
			...extra,
		},
		{ codec_type: "audio", codec_name: "aac" },
	],
	format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: 10.02, size },
});
const originalProbe = {
	streams: [{ codec_type: "video", codec_name: "prores", width: 1280, height: 720 }],
	format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: 10 },
};

/** ffprobe answers by URL: the original, then each proxy */
function probes(byProxy: Record<string, object>) {
	ffmpegLib.ffprobe.mockImplementation(async (url: string) => {
		if (url.endsWith("/original")) return originalProbe;
		const id = /proxy-(\w+)$/.exec(url)![1]!;
		return byProxy[id];
	});
}

function job(data: { mediaId: string; fallback?: boolean } = { mediaId: "m1" }, children = {}) {
	return {
		...fakeJob("verifyProxies", data, children),
		queueQualifiedName: "bull:media-light",
		updateData: vi.fn(async () => {}),
		moveToWaitingChildren: vi.fn(async () => true),
	};
}

beforeEach(() => {
	resetMocks();
	queue.add.mockReset().mockResolvedValue({});
	prisma.mediaFile.findMany.mockResolvedValue(proxies);
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("verifyProxies", () => {
	it("passes the smallest proxy on when all check out", async () => {
		probes({ p720: goodProbe(1280, 720, 2000), p480: goodProbe(854, 480, 1000) });
		const j = job();
		await expect(verifyProxies(j as never, "token")).resolves.toEqual({ proxyId: "p480" });
		expect(queue.add).not.toHaveBeenCalled();
		expect(prisma.mediaFile.deleteMany).not.toHaveBeenCalled();
	});

	it.each([
		["another codec", { codec_name: "hevc" }],
		["a Main profile", { profile: "Main" }],
		["the wrong level", { level: 40 }],
		["10 bit", { pix_fmt: "yuv420p10le" }],
		["larger than its box", { width: 1920, height: 1080 }],
	])("falls back to a server transcode for %s", async (_name, broken) => {
		probes({ p720: goodProbe(1280, 720, 2000), p480: goodProbe(854, 480, 1000, broken) });
		const j = job();
		await expect(verifyProxies(j as never, "token")).rejects.toBeInstanceOf(WaitingChildrenError);
		// both proxies go, the transcode makes new ones
		expect(
			sharedStorage.deleteObject.mock.calls.map(([, , o]) => (o as { proxyId: string }).proxyId),
		).toEqual(["p720", "p480"]);
		expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({ where: { proxyOfId: "m1" } });
		expect(j.updateData).toHaveBeenCalledWith({ mediaId: "m1", fallback: true });
		expect(queue.add).toHaveBeenCalledWith(
			"transcode",
			expect.objectContaining({ mediaId: "m1", renditions: expect.any(Array) }),
			{ parent: { id: "job-1", queue: "bull:media-light" }, failParentOnFailure: true },
		);
		expect(j.moveToWaitingChildren).toHaveBeenCalledWith("token");
	});

	it.each([
		[
			"missing audio",
			{ p480: { ...goodProbe(854, 480, 1000), streams: [goodProbe(854, 480, 1000).streams[0]] } },
		],
		["another size than uploaded", { p480: goodProbe(854, 480, 999) }],
		[
			"shorter than the original",
			{
				p480: {
					...goodProbe(854, 480, 1000),
					format: { format_name: "mov,mp4", duration: 7, size: 1000 },
				},
			},
		],
	])("falls back for %s", async (_name, broken) => {
		probes({ p720: goodProbe(1280, 720, 2000), ...broken });
		await expect(verifyProxies(job() as never, "token")).rejects.toBeInstanceOf(
			WaitingChildrenError,
		);
	});

	it("falls back for a rendition larger than the original", async () => {
		const p1080 = {
			id: "p1080",
			width: 1920,
			height: 1080,
			size: 3000n,
			duration: 10,
			audioCodec: "aac",
		};
		prisma.mediaFile.findMany.mockResolvedValue([p1080, ...proxies]);
		probes({
			p1080: goodProbe(1920, 1080, 3000),
			p720: goodProbe(1280, 720, 2000),
			p480: goodProbe(854, 480, 1000),
		});
		await expect(verifyProxies(job() as never, "token")).rejects.toBeInstanceOf(
			WaitingChildrenError,
		);
		expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain(
			"1080p: rendition larger than the 1280x720 original",
		);
	});

	it("falls back without finished proxies", async () => {
		prisma.mediaFile.findMany.mockResolvedValue([]);
		probes({});
		await expect(verifyProxies(job() as never, "token")).rejects.toBeInstanceOf(
			WaitingChildrenError,
		);
	});

	it("returns the transcode's proxy on its second run", async () => {
		const j = job({ mediaId: "m1", fallback: true }, { "bull:media-heavy:9": { proxyId: "t480" } });
		await expect(verifyProxies(j as never, "token")).resolves.toEqual({ proxyId: "t480" });
		expect(ffmpegLib.ffprobe).not.toHaveBeenCalled();
	});

	it("returns the transcode's result right away when it was done before waiting", async () => {
		probes({ p720: goodProbe(1280, 720, 2000), p480: goodProbe(854, 480, 1000, { level: 40 }) });
		const j = job({ mediaId: "m1" }, { "bull:media-heavy:9": { proxyId: "t480" } });
		j.moveToWaitingChildren.mockResolvedValue(false);
		await expect(verifyProxies(j as never, "token")).resolves.toEqual({ proxyId: "t480" });
	});
});
