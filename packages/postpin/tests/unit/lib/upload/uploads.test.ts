import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CANCEL_FAILED,
	PartError,
	UploadManager,
	partRange,
	retryDelay,
	type PutPart,
	type StoredUpload,
} from "#lib/upload/uploads.svelte.ts";

const MiB = 1024 * 1024;
const form = {
	fileName: "clip.mov",
	frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
	startFrameIndex: 0,
	durationFrameCount: 250,
	userSet: [],
	cutLevel: "medium" as const,
};

/** A file of `size` bytes; content doesn't matter */
const file = (size: number, name = "clip.mov", lastModified = 1000) =>
	new File([new Uint8Array(size)], name, { lastModified });

function memoryStorage() {
	let value: Record<string, StoredUpload> = {};
	return {
		read: () => structuredClone(value),
		write: (v: Record<string, StoredUpload>) => (value = structuredClone(v)),
	};
}

const urls = (n: number, from = 1) =>
	Array.from({ length: n }, (_, i) => ({ partNumber: from + i, url: `put-${from + i}` }));

/** localStorage that throws everything away, like in private mode or when it is full */
const forgetfulStorage = () => ({ read: () => ({}), write: () => {} });

/** A PUT that only ends when the upload is cancelled */
const hangingPut: PutPart = (_url, _body, _progress, signal) =>
	new Promise((_, reject) =>
		signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
	);

function setup(
	put: PutPart,
	partSize = 10,
	parts = 3,
	storage: {
		read(): Record<string, StoredUpload>;
		write(v: Record<string, StoredUpload>): void;
	} = memoryStorage(),
) {
	const api = {
		createWebExport: vi.fn(async () => ({ id: "e1" })),
		initWebUpload: vi.fn(async () => ({ uploadId: "u1", partSize, parts: urls(parts) })),
		resumeWebUpload: vi.fn(),
		completeWebUpload: vi.fn(async (input: { parts: unknown[] }) => void input),
		abortWebUpload: vi.fn(async () => {}),
	};
	const onChange = vi.fn();
	const manager = new UploadManager(async () => api, put, storage, onChange);
	return { api, storage, onChange, manager };
}

const start = (manager: UploadManager, f = file(25)) =>
	manager.start({ file: f, projectId: "p1", timelineId: "t1", name: "Clip", form });

/** Waits until the manager's background run settled */
const settled = (manager: UploadManager, id = "e1") =>
	vi.waitFor(() => {
		const status = manager.uploads[id]?.status;
		if (status === "uploading" || status === "completing") throw new Error(status);
	});

beforeEach(() => {
	vi.useRealTimers();
});

describe("partRange", () => {
	it("splits the file like S3's part layout, the last part is shorter", () => {
		expect(partRange(1, 32 * MiB, 100 * MiB)).toEqual({ start: 0, end: 32 * MiB });
		expect(partRange(4, 32 * MiB, 100 * MiB)).toEqual({ start: 96 * MiB, end: 100 * MiB });
	});
});

describe("retryDelay", () => {
	it("doubles with every attempt", () => {
		expect(retryDelay(0)).toBeGreaterThanOrEqual(1000);
		expect(retryDelay(0)).toBeLessThan(1250);
		expect(retryDelay(3)).toBeGreaterThanOrEqual(8000);
	});
});

describe("UploadManager", () => {
	it("uploads every part and completes with their ETags, in part order", async () => {
		const bodies: number[] = [];
		const put: PutPart = async (url, body, onProgress) => {
			bodies.push(body.size);
			onProgress(body.size);
			return `etag-${url}`;
		};
		const { api, manager, storage, onChange } = setup(put);
		expect(await start(manager)).toBe("e1");
		// stored right away, so a reload can continue
		expect(storage.read()["e1"]).toMatchObject({ uploadId: "u1", size: 25, fileName: "clip.mov" });

		await settled(manager);
		expect(bodies.sort()).toEqual([10, 10, 5]);
		expect(api.completeWebUpload).toHaveBeenCalledWith({
			exportId: "e1",
			uploadId: "u1",
			parts: [
				{ partNumber: 1, etag: "etag-put-1" },
				{ partNumber: 2, etag: "etag-put-2" },
				{ partNumber: 3, etag: "etag-put-3" },
			],
			form,
		});
		expect(manager.uploads["e1"]).toMatchObject({ status: "done", loaded: 25 });
		expect(storage.read()).toEqual({});
		expect(onChange).toHaveBeenCalled();
	});

	it("uploads at most four parts at the same time", async () => {
		let running = 0;
		let most = 0;
		const put: PutPart = async () => {
			most = Math.max(most, ++running);
			await new Promise((r) => setTimeout(r, 5));
			running--;
			return "e";
		};
		const { manager } = setup(put, 1, 10);
		await start(manager, file(10));
		await settled(manager);
		expect(most).toBe(4);
	});

	it("tries a failed part again", async () => {
		vi.useFakeTimers();
		let calls = 0;
		const put: PutPart = async () => {
			if (++calls === 1) throw new PartError("Network error", false);
			return "e";
		};
		const { api, manager } = setup(put, 25, 1);
		await start(manager);
		await vi.advanceTimersByTimeAsync(2000);
		vi.useRealTimers();
		await settled(manager);
		expect(calls).toBe(2);
		expect(api.completeWebUpload).toHaveBeenCalled();
	});

	it("gives up after a permanent error and keeps what is needed to continue", async () => {
		const put: PutPart = async (url) => {
			if (url === "put-2") throw new PartError("Storage answered 403", true);
			return "e";
		};
		const { api, manager, storage } = setup(put);
		await start(manager);
		await settled(manager);
		expect(manager.uploads["e1"]).toMatchObject({
			status: "interrupted",
			error: "Storage answered 403",
		});
		expect(api.completeWebUpload).not.toHaveBeenCalled();
		expect(storage.read()["e1"]).toBeDefined();
	});

	it("continues with only the missing parts, with the same file", async () => {
		const sent: string[] = [];
		const put: PutPart = async (url) => {
			sent.push(url);
			return `etag-${url}`;
		};
		const { api, manager, storage } = setup(put);
		storage.write({
			e1: {
				exportId: "e1",
				projectId: "p1",
				timelineId: "t1",
				name: "Clip",
				fileName: "clip.mov",
				size: 25,
				lastModified: 1000,
				uploadId: "u1",
				partSize: 10,
				form,
			},
		});
		api.resumeWebUpload.mockResolvedValue({
			partSize: 10,
			uploaded: [
				{ partNumber: 1, etag: "old-1" },
				{ partNumber: 2, etag: "old-2" },
			],
			parts: urls(1, 3),
		});

		await expect(manager.resume("e1", file(25, "other.mov"))).rejects.toThrow("same file");
		await expect(manager.resume("e1", file(25, "clip.mov", 2000))).rejects.toThrow("same file");

		await manager.resume("e1", file(25));
		// the two parts S3 has count right away
		expect(manager.uploads["e1"]!.loaded).toBeGreaterThanOrEqual(20);
		await settled(manager);
		expect(sent).toEqual(["put-3"]);
		expect(api.completeWebUpload.mock.calls[0]![0].parts).toEqual([
			{ partNumber: 1, etag: "old-1" },
			{ partNumber: 2, etag: "old-2" },
			{ partNumber: 3, etag: "etag-put-3" },
		]);
	});

	it("cancel stops the parts, aborts the upload in S3 and forgets it", async () => {
		const put: PutPart = (_url, _body, _progress, signal) =>
			new Promise((_, reject) =>
				signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
			);
		const { api, manager, storage } = setup(put);
		await start(manager);
		expect(manager.running).toHaveLength(1);

		await manager.cancel("e1");
		expect(manager.uploads["e1"]!.status).toBe("cancelled");
		expect(manager.running).toHaveLength(0);
		expect(api.abortWebUpload).toHaveBeenCalledWith({ exportId: "e1", uploadId: "u1" });
		expect(storage.read()).toEqual({});
		expect(api.completeWebUpload).not.toHaveBeenCalled();
	});

	it("cancels without localStorage: the upload id is kept in memory", async () => {
		const { api, manager } = setup(hangingPut, 10, 3, forgetfulStorage());
		await start(manager);
		expect(manager.stored("e1")).toMatchObject({ uploadId: "u1" });

		expect(await manager.cancel("e1")).toBe(true);
		expect(api.abortWebUpload).toHaveBeenCalledWith({ exportId: "e1", uploadId: "u1" });
		expect(manager.stored("e1")).toBeUndefined();
	});

	it("resume keeps the entry from localStorage in memory, for when the browser loses it", async () => {
		const storage = memoryStorage();
		const first = setup(async () => "e", 10, 3, storage);
		first.api.completeWebUpload.mockRejectedValue(new Error("offline"));
		await start(first.manager);
		await settled(first.manager);
		expect(storage.read()["e1"]).toBeDefined();

		// a new tab: the entry only comes from localStorage
		const { api, manager } = setup(hangingPut, 10, 3, storage);
		api.resumeWebUpload.mockResolvedValue({ partSize: 10, uploaded: [], parts: urls(3) });
		await manager.resume("e1", file(25));
		storage.write({});
		await manager.cancel("e1");
		expect(api.abortWebUpload).toHaveBeenCalledWith({ exportId: "e1", uploadId: "u1" });
	});

	it("keeps the upload when cancelling fails, so it can be tried again", async () => {
		const { api, manager, onChange, storage } = setup(hangingPut);
		await start(manager);
		api.abortWebUpload.mockRejectedValueOnce(
			Object.assign(new Error("x"), { status: 500, body: { message: "Internal Error" } }),
		);

		expect(await manager.cancel("e1")).toBe(false);
		expect(manager.stored("e1")).toMatchObject({ uploadId: "u1" });
		expect(storage.read()["e1"]).toMatchObject({ uploadId: "u1" });
		expect(manager.uploads["e1"]).toMatchObject({ status: "interrupted", error: CANCEL_FAILED });
		expect(manager.running).toHaveLength(0);
		expect(onChange).toHaveBeenCalled();

		expect(await manager.cancel("e1")).toBe(true);
		expect(api.abortWebUpload).toHaveBeenCalledTimes(2);
		expect(api.abortWebUpload).toHaveBeenLastCalledWith({ exportId: "e1", uploadId: "u1" });
		expect(manager.stored("e1")).toBeUndefined();
		expect(storage.read()).toEqual({});
		expect(manager.uploads["e1"]!.status).toBe("cancelled");
	});

	it("a network error while cancelling keeps the upload too", async () => {
		const { api, manager } = setup(hangingPut);
		await start(manager);
		api.abortWebUpload.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		expect(await manager.cancel("e1")).toBe(false);
		expect(manager.stored("e1")).toBeDefined();
	});

	it.each([404, 409])(
		"%s while cancelling: nothing left to abort, so it is forgotten",
		async (status) => {
			const { api, manager, storage } = setup(hangingPut);
			await start(manager);
			api.abortWebUpload.mockRejectedValueOnce(Object.assign(new Error("x"), { status }));
			expect(await manager.cancel("e1")).toBe(true);
			expect(manager.stored("e1")).toBeUndefined();
			expect(storage.read()).toEqual({});
			expect(manager.uploads["e1"]!.status).toBe("cancelled");
		},
	);

	it("reports the bytes in flight as progress", async () => {
		let release!: () => void;
		const put: PutPart = (_url, body, onProgress) => {
			onProgress(body.size / 2);
			return new Promise((resolve) => (release = () => resolve("e")));
		};
		const { manager } = setup(put, 20, 1);
		await start(manager, file(20));
		await vi.waitFor(() => expect(manager.uploads["e1"]!.loaded).toBe(10));
		release();
		await settled(manager);
		expect(manager.uploads["e1"]!.loaded).toBe(20);
	});

	it("a failing init (e.g. file too large) refreshes the list and rethrows", async () => {
		const { api, manager, onChange, storage } = setup(async () => "e");
		api.initWebUpload.mockRejectedValue(
			Object.assign(new Error("x"), { status: 413, body: { message: "too large" } }),
		);
		await expect(start(manager)).rejects.toMatchObject({ status: 413 });
		expect(onChange).toHaveBeenCalled();
		expect(storage.read()).toEqual({});
	});
});
