import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeHost, fakeNle } from "./fakes.ts";

const api = vi.hoisted(() => ({
	createExport: vi.fn(),
	initUpload: vi.fn(),
	completeUpload: vi.fn(),
	abortUpload: vi.fn(),
	getConfig: vi.fn(),
	initProxyUploads: vi.fn(),
}));
vi.mock("@postpin-io/api-client-ts", () => api);

import { renderAndUpload } from "../src/renderAndUpload.ts";
import type { Client } from "@postpin-io/api-client-ts/client";
import type { HostBridge } from "../src/bridge.ts";
import { PROXY_RENDITIONS } from "@postpin-io/shared/media/hls";

const client = {} as Client;
const parts = [
	{ partNumber: 1, url: "https://s3/part1" },
	{ partNumber: 2, url: "https://s3/part2" },
	{ partNumber: 3, url: "https://s3/part3" },
	{ partNumber: 4, url: "https://s3/part4" },
];
const exportPath = { projectId: "p1", timelineId: "t1", exportId: "exp-1" };

let nle: ReturnType<typeof fakeNle>;
let host: ReturnType<typeof fakeHost>;
let onStep: ReturnType<typeof vi.fn>;

const run = () =>
	renderAndUpload({
		nle,
		host: host as unknown as HostBridge,
		client,
		projectId: "p1",
		timelineId: "t1",
		onStep,
	});

beforeEach(() => {
	nle = fakeNle();
	host = fakeHost();
	onStep = vi.fn();
	for (const fn of Object.values(api)) fn.mockReset();
	api.createExport.mockResolvedValue({ data: { id: "exp-1" } });
	api.initUpload.mockResolvedValue({
		data: { uploadId: "up-1", partSize: 32 * 1024 * 1024, parts },
	});
	api.completeUpload.mockResolvedValue({ data: undefined });
	api.abortUpload.mockResolvedValue({ data: undefined });
	api.getConfig.mockResolvedValue({
		data: {
			apiVersion: 1,
			serverRelease: "1.0.0",
			transcode: {
				mode: "plugin",
				renditions: PROXY_RENDITIONS,
				audio: { codec: "aac", bitRate: 128_000 },
			},
		},
	});
});

describe("renderAndUpload", () => {
	it("renders, creates the export, uploads the file and completes it with the snapshot", async () => {
		await expect(run()).resolves.toEqual({ exportId: "exp-1" });

		expect(api.createExport).toHaveBeenCalledWith({
			client,
			path: { projectId: "p1", timelineId: "t1" },
			body: { nleProjectId: "nle-project", nleTimelineId: "nle-timeline" },
			throwOnError: true,
		});
		expect(host.getFileSize).toHaveBeenCalledWith("/renders/cut3.mp4");
		expect(api.initUpload).toHaveBeenCalledWith({
			client,
			path: exportPath,
			body: { fileSize: 100 * 1024 * 1024 },
			throwOnError: true,
		});
		expect(host.uploadFile).toHaveBeenCalledWith(
			"/renders/cut3.mp4",
			32 * 1024 * 1024,
			parts,
			expect.any(Function),
		);
		expect(api.completeUpload).toHaveBeenCalledWith({
			client,
			path: exportPath,
			body: {
				uploadId: "up-1",
				parts: [{ partNumber: 1, etag: '"e1"' }],
				timelineSnapshot: { id: "nle-timeline" },
			},
			throwOnError: true,
		});
		expect(api.abortUpload).not.toHaveBeenCalled();
	});

	it("reports each step", async () => {
		await run();
		expect(onStep.mock.calls.map(([step]) => step)).toEqual([
			"Rendering preview...",
			"Render complete. Creating export...",
			"Export created with ID: exp-1. Initializing upload...",
			"Uploading 100 MB in 4 parts...",
			"Upload complete. Starting processing...",
		]);
	});

	it("builds the snapshot before rendering, so a missing snapshot costs no render", async () => {
		await run();
		expect(nle.buildTimelineSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
			nle.renderPreview.mock.invocationCallOrder[0]!,
		);
	});

	it("forwards render and upload progress", async () => {
		const onRenderProgress = vi.fn();
		const onUploadProgress = vi.fn();
		nle.renderPreview.mockImplementation(async (onProgress) => {
			onProgress({ percent: 50, estimatedTimeRemainingMs: 1000 });
			return "/renders/cut3.mp4";
		});
		host.uploadFile.mockImplementation(async (_path, _size, _parts, onProgress) => {
			onProgress({ uploadedBytes: 1, totalBytes: 2 });
			return [];
		});
		await renderAndUpload({
			nle,
			host: host as unknown as HostBridge,
			client,
			projectId: "p1",
			timelineId: "t1",
			onRenderProgress,
			onUploadProgress,
		});
		expect(onRenderProgress).toHaveBeenCalledWith({ percent: 50, estimatedTimeRemainingMs: 1000 });
		// the total covers every file of the run, here only the 100 MB render
		expect(onUploadProgress).toHaveBeenCalledWith({
			uploadedBytes: 1,
			totalBytes: 100 * 1024 * 1024,
		});
	});

	it("works without any callbacks", async () => {
		nle.renderPreview.mockImplementation(async (onProgress) => {
			onProgress({ percent: 1, estimatedTimeRemainingMs: 0 });
			return "/r.mp4";
		});
		await expect(
			renderAndUpload({
				nle,
				host: host as unknown as HostBridge,
				client,
				projectId: "p1",
				timelineId: "t1",
			}),
		).resolves.toEqual({ exportId: "exp-1" });
	});

	it("fails before rendering when the NLE has no open timeline", async () => {
		nle.getTimelineInfo.mockResolvedValue(null as never);
		await expect(run()).rejects.toThrow("No timeline found");
		expect(nle.renderPreview).not.toHaveBeenCalled();
		expect(api.createExport).not.toHaveBeenCalled();
	});

	it("creates no export when rendering fails", async () => {
		nle.renderPreview.mockRejectedValue(new Error("Render failed"));
		await expect(run()).rejects.toThrow("Render failed");
		expect(api.createExport).not.toHaveBeenCalled();
	});

	it("doesn't abort anything when the upload can't be initialized", async () => {
		api.initUpload.mockRejectedValue({ message: "Too large" });
		await expect(run()).rejects.toEqual({ message: "Too large" });
		expect(host.uploadFile).not.toHaveBeenCalled();
		expect(api.abortUpload).not.toHaveBeenCalled();
	});

	it.each([
		["the upload", () => host.uploadFile.mockRejectedValue(new Error("Network down"))],
		[
			"completing the upload",
			() => api.completeUpload.mockRejectedValue(new Error("Network down")),
		],
	])("aborts the multipart upload and rethrows when %s fails", async (_, makeFail) => {
		makeFail();
		await expect(run()).rejects.toThrow("Network down");
		expect(api.abortUpload).toHaveBeenCalledWith({
			client,
			path: exportPath,
			body: { uploadId: "up-1" },
		});
	});

	it("rethrows the original error when aborting fails too", async () => {
		host.uploadFile.mockRejectedValue(new Error("Network down"));
		api.abortUpload.mockRejectedValue(new Error("Abort failed"));
		await expect(run()).rejects.toThrow("Network down");
	});

	it("fails before rendering when the NLE returns no timeline snapshot", async () => {
		nle.buildTimelineSnapshot.mockResolvedValue(null as never);
		await expect(run()).rejects.toThrow("Failed to build timeline snapshot");
		expect(nle.renderPreview).not.toHaveBeenCalled();
		expect(host.uploadFile).not.toHaveBeenCalled();
	});
});

describe("renderAndUpload with review versions encoded by the plugin", () => {
	const MiB = 1024 * 1024;
	const hls = (bytes: number) => ({
		init: { offset: 0, length: 10 },
		segments: [{ duration: 2, offset: 10, length: bytes - 10 }],
	});
	const proxyTargets = [
		{
			proxyId: "px-720",
			uploadId: "pu-720",
			partSize: 32 * MiB,
			parts: [{ partNumber: 1, url: "u720" }],
		},
		{
			proxyId: "px-480",
			uploadId: "pu-480",
			partSize: 32 * MiB,
			parts: [{ partNumber: 1, url: "u480" }],
		},
	];

	/** a host with the bundled ffmpeg; the render is 1280x720 */
	function encodingHost(
		probe = { width: 1280, height: 720, rotation: null, hasAudio: true, duration: 10 },
	) {
		return {
			...fakeHost(),
			probe: vi.fn(async () => probe),
			transcode: vi.fn(
				async (
					_input: string,
					renditions: { height: number }[],
					_a: boolean,
					onProgress: (f: number) => void,
				) => {
					onProgress(0.5);
					return renditions.map((r) => ({
						path: `/tmp/${r.height}.mp4`,
						hls: hls(1000),
						bytes: 1000,
					}));
				},
			),
			removeFile: vi.fn(async () => {}),
		};
	}

	let encHost: ReturnType<typeof encodingHost>;
	const runWith = (extra: object = {}) =>
		renderAndUpload({
			nle,
			host: encHost as unknown as HostBridge,
			client,
			projectId: "p1",
			timelineId: "t1",
			onStep,
			...extra,
		});

	beforeEach(() => {
		encHost = encodingHost();
		api.initProxyUploads.mockReset().mockResolvedValue({ data: { proxies: proxyTargets } });
		api.completeUpload.mockResolvedValue({ data: { transcodedBy: "plugin" } });
	});

	it("starts the render's upload first, encodes meanwhile and adds the review versions", async () => {
		const onTranscodeProgress = vi.fn();
		await expect(runWith({ onTranscodeProgress })).resolves.toEqual({ exportId: "exp-1" });

		// init-upload for the render alone, before encoding is done
		expect(api.initUpload).toHaveBeenCalledWith({
			client,
			path: exportPath,
			body: { fileSize: 100 * MiB },
			throwOnError: true,
		});
		expect(encHost.uploadFile.mock.invocationCallOrder[0]).toBeLessThan(
			encHost.transcode.mock.invocationCallOrder[0]!,
		);
		const [input, renditions, hasAudio] = encHost.transcode.mock.calls[0]!;
		expect(input).toBe("/renders/cut3.mp4");
		// no 2160p or 1080p for a 720p render
		expect(renditions.map((r) => r.height)).toEqual([720, 480]);
		expect(hasAudio).toBe(true);
		expect(onTranscodeProgress).toHaveBeenCalledWith(0.5);

		expect(api.initProxyUploads).toHaveBeenCalledWith({
			client,
			path: exportPath,
			body: {
				proxies: [
					{ width: 1280, height: 720, bitRate: 3_500_000, fileSize: 1000 },
					{ width: 854, height: 480, bitRate: 1_200_000, fileSize: 1000 },
				],
			},
			throwOnError: true,
		});
		expect(
			encHost.uploadFile.mock.calls.map(([path, , targetParts]) => [path, targetParts]),
		).toEqual([
			["/renders/cut3.mp4", parts],
			["/tmp/720.mp4", proxyTargets[0]!.parts],
			["/tmp/480.mp4", proxyTargets[1]!.parts],
		]);
		expect(api.completeUpload.mock.calls[0]![0].body.proxies).toEqual([
			{
				proxyId: "px-720",
				uploadId: "pu-720",
				parts: [{ partNumber: 1, etag: '"e1"' }],
				hls: hls(1000),
				hasAudio: true,
			},
			{
				proxyId: "px-480",
				uploadId: "pu-480",
				parts: [{ partNumber: 1, etag: '"e1"' }],
				hls: hls(1000),
				hasAudio: true,
			},
		]);
		expect(encHost.removeFile.mock.calls.map(([path]) => path)).toEqual([
			"/tmp/720.mp4",
			"/tmp/480.mp4",
		]);
	});

	it("picks the renditions by the size the player shows, after rotation", async () => {
		// stored 720x1280 with rotation: shown as 1280x720
		encHost = encodingHost({
			width: 720,
			height: 1280,
			rotation: 90,
			hasAudio: false,
			duration: 10,
		});
		await runWith();
		expect(encHost.transcode.mock.calls[0]![1].map((r) => r.height)).toEqual([720, 480]);
		expect(encHost.transcode.mock.calls[0]![2]).toBe(false);
	});

	it("reports upload progress over every file known so far", async () => {
		const onUploadProgress = vi.fn();
		encHost.uploadFile.mockImplementation(async (_path, _size, _parts, onProgress) => {
			onProgress({ uploadedBytes: 1, totalBytes: 999 });
			return [{ partNumber: 1, etag: '"e1"' }];
		});
		await runWith({ onUploadProgress });
		const render = 100 * MiB;
		expect(onUploadProgress.mock.calls.map(([p]) => p)).toEqual([
			{ uploadedBytes: 1, totalBytes: render },
			// the review versions join with their sizes
			{ uploadedBytes: 2, totalBytes: render + 1000 },
			{ uploadedBytes: 3, totalBytes: render + 2000 },
		]);
	});

	it("uploads without review versions when encoding fails, the server encodes", async () => {
		encHost.transcode.mockRejectedValue(new Error("ffmpeg exited with code 1"));
		await expect(runWith()).resolves.toEqual({ exportId: "exp-1" });
		expect(onStep).toHaveBeenCalledWith(
			"Encoding failed, PostPin encodes the review versions instead: ffmpeg exited with code 1",
		);
		expect(api.initProxyUploads).not.toHaveBeenCalled();
		expect(api.completeUpload.mock.calls[0]![0].body).not.toHaveProperty("proxies");
	});

	it("completes without them when the server can't take the review versions, e.g. an older one", async () => {
		api.initProxyUploads.mockRejectedValue({ message: "Not Found" });
		await expect(runWith()).resolves.toEqual({ exportId: "exp-1" });
		expect(onStep).toHaveBeenCalledWith(
			"Uploading the review versions failed, PostPin encodes them instead: Not Found",
		);
		expect(api.completeUpload.mock.calls[0]![0].body).not.toHaveProperty("proxies");
		expect(encHost.removeFile).toHaveBeenCalledTimes(2);
	});

	it("completes without them when a review version's upload fails", async () => {
		encHost.uploadFile.mockImplementation(async (path) => {
			if (path === "/tmp/480.mp4") throw new Error("Network blip");
			return [{ partNumber: 1, etag: '"e1"' }];
		});
		await expect(runWith()).resolves.toEqual({ exportId: "exp-1" });
		expect(api.completeUpload.mock.calls[0]![0].body).not.toHaveProperty("proxies");
		expect(api.abortUpload).not.toHaveBeenCalled();
	});

	it("doesn't encode when the server encodes itself", async () => {
		api.getConfig.mockResolvedValue({
			data: {
				apiVersion: 1,
				serverRelease: "1.0.0",
				transcode: {
					mode: "server",
					renditions: PROXY_RENDITIONS,
					audio: { codec: "aac", bitRate: 128_000 },
				},
			},
		});
		await runWith();
		expect(encHost.probe).not.toHaveBeenCalled();
		expect(encHost.transcode).not.toHaveBeenCalled();
		expect(api.initProxyUploads).not.toHaveBeenCalled();
	});

	it("tells when the server didn't take the review versions", async () => {
		api.completeUpload.mockResolvedValue({ data: { transcodedBy: "server" } });
		await runWith();
		expect(onStep).toHaveBeenCalledWith(
			"PostPin couldn't use the review versions and encodes them itself.",
		);
	});

	it("aborts everything when the render's upload fails, and still removes the review versions", async () => {
		encHost.uploadFile.mockImplementation(async (path) => {
			if (path === "/renders/cut3.mp4") throw new Error("Network down");
			return [{ partNumber: 1, etag: '"e1"' }];
		});
		await expect(runWith()).rejects.toThrow("Network down");
		expect(api.abortUpload).toHaveBeenCalledWith(
			expect.objectContaining({
				path: exportPath,
				body: expect.objectContaining({ uploadId: "up-1" }),
			}),
		);
		expect(api.completeUpload).not.toHaveBeenCalled();
		// cleaned up once the encoding in the background is done
		await vi.waitFor(() => expect(encHost.removeFile).toHaveBeenCalledTimes(2));
	});

	it("asks for the config before rendering, so a version mismatch costs no render", async () => {
		api.getConfig.mockRejectedValue(new Error("426"));
		await expect(runWith()).rejects.toThrow("426");
		expect(nle.renderPreview).not.toHaveBeenCalled();
	});
});
