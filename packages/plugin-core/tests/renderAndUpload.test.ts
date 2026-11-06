import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeHost, fakeNle } from "./fakes.ts";

const api = vi.hoisted(() => ({
	createExport: vi.fn(),
	initUpload: vi.fn(),
	completeUpload: vi.fn(),
	abortUpload: vi.fn(),
}));
vi.mock("@postpin-io/api-client-ts", () => api);

import { renderAndUpload } from "../src/renderAndUpload.ts";
import type { Client } from "@postpin-io/api-client-ts/client";
import type { HostBridge } from "../src/bridge.ts";

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
		expect(onUploadProgress).toHaveBeenCalledWith({ uploadedBytes: 1, totalBytes: 2 });
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
