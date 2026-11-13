// Uploads from the browser, straight to S3 with presigned part URLs. One manager for the whole
// tab: an upload keeps running while the user moves around in the app, and the export list and
// the indicator in the layout show its progress. What is needed to continue or cancel an upload is
// kept in memory and in localStorage; after a reload the user has to choose the same file again,
// because browsers don't let a page reopen a file by itself. Without localStorage (private mode,
// full) it only lasts as long as the tab.
import type { UploadForm } from "#lib/components/exports/upload.remote.ts";
import type { CutList } from "@postpin-io/shared/logic/cut-list";
import type { MultipartUploadPartUrl, UploadedPart } from "@postpin-io/shared/storage";

/** Parts uploaded at the same time */
export const PARALLEL_PARTS = 4;
/** Attempts per part before the upload counts as interrupted */
export const PART_ATTEMPTS = 5;
const STORAGE_KEY = "postpin.uploads";

export type UploadStatus = "uploading" | "completing" | "done" | "interrupted" | "cancelled";

export type Upload = {
	exportId: string;
	projectId: string;
	timelineId: string;
	name: string;
	fileName: string;
	size: number;
	/** Bytes S3 has, including the parts in flight */
	loaded: number;
	status: UploadStatus;
	error?: string;
};

/** What localStorage keeps to continue an upload */
export type StoredUpload = Omit<Upload, "loaded" | "status" | "error"> & {
	uploadId: string;
	lastModified: number;
	partSize: number;
	form: UploadForm;
};

type Api = {
	createWebExport(a: { projectId: string; timelineId: string; name: string }): Promise<{
		id: string;
	}>;
	initWebUpload(a: { exportId: string; fileSize: number }): Promise<{
		uploadId: string;
		partSize: number;
		parts: MultipartUploadPartUrl[];
	}>;
	resumeWebUpload(a: { exportId: string; uploadId: string }): Promise<{
		partSize: number;
		uploaded: UploadedPart[];
		parts: MultipartUploadPartUrl[];
	}>;
	completeWebUpload(a: {
		exportId: string;
		uploadId: string;
		parts: UploadedPart[];
		form: UploadForm;
	}): Promise<void>;
	abortWebUpload(a: { exportId: string; uploadId: string }): Promise<void>;
	attachWebUploadCutList(a: { exportId: string; cutList: CutList }): Promise<void>;
};

/** PUTs one part, reports its uploaded bytes and resolves with the ETag S3 answered */
export type PutPart = (
	url: string,
	body: Blob,
	onProgress: (loaded: number) => void,
	signal: AbortSignal,
) => Promise<string>;

export class PartError extends Error {
	constructor(
		message: string,
		/** 4xx except 408/429: trying again won't help */
		readonly permanent: boolean,
	) {
		super(message);
	}
}

/** XMLHttpRequest, because fetch can't report upload progress */
export const xhrPutPart: PutPart = (url, body, onProgress, signal) =>
	new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.upload.onprogress = (e) => onProgress(e.loaded);
		xhr.onload = () => {
			const etag = xhr.getResponseHeader("ETag");
			if (xhr.status >= 200 && xhr.status < 300 && etag) return resolve(etag);
			const permanent =
				xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429;
			reject(
				new PartError(
					etag || xhr.status >= 300
						? `Storage answered ${xhr.status}`
						: "Storage didn't send the ETag header (check its CORS rules)",
					permanent,
				),
			);
		};
		xhr.onerror = () => reject(new PartError("Network error", false));
		signal.addEventListener("abort", () => xhr.abort());
		xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
		xhr.send(body);
	});

/** Wait before attempt n+1: 1 s, 2 s, 4 s, 8 s, plus a little jitter */
export const retryDelay = (attempt: number) => 1000 * 2 ** attempt + Math.random() * 250;

export const partRange = (partNumber: number, partSize: number, fileSize: number) => ({
	start: (partNumber - 1) * partSize,
	end: Math.min(partNumber * partSize, fileSize),
});

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function sleep(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new DOMException("Aborted", "AbortError"));
		});
	});
}

/** The server has nothing left to abort: the upload is gone (404) or already complete (409) */
const nothingToAbort = (e: unknown) => {
	const status = (e as { status?: number })?.status;
	return status === 404 || status === 409;
};

export const CANCEL_FAILED = "Cancelling failed. Try again.";

const errorMessage = (e: unknown) =>
	(e as { body?: { message?: string } })?.body?.message ??
	(e instanceof Error ? e.message : "Upload failed");

/** localStorage that may be missing or full: nothing to continue then, the upload itself works */
export const browserStorage = {
	read(): Record<string, StoredUpload> {
		try {
			return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
		} catch {
			return {};
		}
	},
	write(value: Record<string, StoredUpload>) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} catch {
			// private mode or quota: resuming after a reload won't work, everything else does
		}
	},
};

export class UploadManager {
	/** By export id */
	uploads: Record<string, Upload> = $state({});
	// bookkeeping, not state: nothing renders from it
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#controllers = new Map<string, AbortController>();
	/**
	 * What localStorage keeps, for this tab: cancelling needs the upload id even when the
	 * browser didn't store it. By export id.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#entries = new Map<string, StoredUpload>();

	constructor(
		private api: () => Promise<Api>,
		private putPart: PutPart = xhrPutPart,
		private storage: typeof browserStorage = browserStorage,
		/** Called when an export changed (created, uploaded), so lists can refresh */
		private onChange: () => void | Promise<void> = () => {},
	) {}

	get running() {
		return Object.values(this.uploads).filter(
			(u) => u.status === "uploading" || u.status === "completing",
		);
	}

	/** An unfinished upload of this export: it can be continued with the same file, or cancelled */
	stored(exportId: string): StoredUpload | undefined {
		return this.#entries.get(exportId) ?? this.storage.read()[exportId];
	}

	#store(entry: StoredUpload) {
		this.#entries.set(entry.exportId, entry);
		this.storage.write({ ...this.storage.read(), [entry.exportId]: entry });
	}

	forget(exportId: string) {
		this.#entries.delete(exportId);
		const rest = this.storage.read();
		delete rest[exportId];
		this.storage.write(rest);
	}

	/** Creates the export and uploads the file to it. Resolves with the export id once it started. */
	async start(a: {
		file: File;
		projectId: string;
		timelineId: string;
		name: string;
		form: UploadForm;
		/** Tracks of the video's timeline (from an EDL or FCPXML), see attachCutList */
		cutList?: CutList | null;
	}): Promise<string> {
		const api = await this.api();
		const { id: exportId } = await api.createWebExport({
			projectId: a.projectId,
			timelineId: a.timelineId,
			name: a.name,
		});
		const upload = await api
			.initWebUpload({ exportId, fileSize: a.file.size })
			.catch(async (e: unknown) => {
				// an export that can't get a file (too large, quota full) is useless
				await this.onChange();
				throw e;
			});
		if (a.cutList) {
			// before the parts: the server keeps it, so a resumed upload has it too
			await api
				.attachWebUploadCutList({ exportId, cutList: a.cutList })
				.catch(async (e: unknown) => {
					// the user fixes the list and starts again; the parts S3 has are dropped
					await api.abortWebUpload({ exportId, uploadId: upload.uploadId }).catch(() => {});
					await this.onChange();
					throw e;
				});
		}
		const entry: StoredUpload = {
			exportId,
			projectId: a.projectId,
			timelineId: a.timelineId,
			name: a.name,
			fileName: a.file.name,
			size: a.file.size,
			lastModified: a.file.lastModified,
			uploadId: upload.uploadId,
			partSize: upload.partSize,
			form: a.form,
		};
		this.#store(entry);
		void this.onChange();
		void this.#run(entry, a.file, upload.parts, []);
		return exportId;
	}

	/** Same name, size and modification date: as sure as a browser can be that it's the same file */
	isSameFile(exportId: string, file: File) {
		const entry = this.stored(exportId);
		return (
			!!entry &&
			entry.fileName === file.name &&
			entry.size === file.size &&
			entry.lastModified === file.lastModified
		);
	}

	/** Continues an interrupted upload; only the parts S3 doesn't have yet are sent */
	async resume(exportId: string, file: File) {
		const entry = this.stored(exportId);
		if (!entry) throw new Error("Nothing to continue for this export");
		if (!this.isSameFile(exportId, file)) {
			throw new Error(`Please choose the same file: ${entry.fileName}`);
		}
		// from localStorage after a reload: keep it for this tab too
		this.#entries.set(exportId, entry);
		const api = await this.api();
		const { uploaded, parts } = await api.resumeWebUpload({ exportId, uploadId: entry.uploadId });
		void this.#run(entry, file, parts, uploaded);
	}

	/**
	 * Stops the upload and deletes what S3 already has; the export stays, without a file. The
	 * upload id is only forgotten once the server aborted it: otherwise its parts and the
	 * reserved space would stay with no way to get rid of them. Resolves with whether it worked.
	 */
	async cancel(exportId: string): Promise<boolean> {
		this.#controllers.get(exportId)?.abort();
		const entry = this.stored(exportId);
		// hides the progress right away; a failure below turns it into "interrupted"
		if (this.uploads[exportId]) this.uploads[exportId].status = "cancelled";
		if (entry) {
			try {
				const api = await this.api();
				await api.abortWebUpload({ exportId, uploadId: entry.uploadId });
			} catch (e) {
				if (!nothingToAbort(e)) {
					this.uploads[exportId] = {
						...this.#stateOf(entry),
						loaded: this.uploads[exportId]?.loaded ?? 0,
						status: "interrupted",
						error: CANCEL_FAILED,
					};
					await this.onChange();
					return false;
				}
			}
		}
		this.forget(exportId);
		await this.onChange();
		return true;
	}

	#stateOf(entry: StoredUpload): Upload {
		return {
			exportId: entry.exportId,
			projectId: entry.projectId,
			timelineId: entry.timelineId,
			name: entry.name,
			fileName: entry.fileName,
			size: entry.size,
			loaded: 0,
			status: "uploading",
		};
	}

	async #run(
		entry: StoredUpload,
		file: File,
		urls: MultipartUploadPartUrl[],
		uploaded: UploadedPart[],
	) {
		const { exportId } = entry;
		this.#controllers.get(exportId)?.abort();
		const controller = new AbortController();
		this.#controllers.set(exportId, controller);
		const { signal } = controller;

		// local to this run; `state` below is what renders
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const done = new Map(uploaded.map((p) => [p.partNumber, p.etag]));
		const partSize = (n: number) => {
			const { start, end } = partRange(n, entry.partSize, entry.size);
			return end - start;
		};
		let doneBytes = [...done.keys()].reduce((sum, n) => sum + partSize(n), 0);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const inFlight = new Map<number, number>();

		this.uploads[exportId] = { ...this.#stateOf(entry), loaded: doneBytes };
		const state = this.uploads[exportId]!;
		const report = () => {
			state.loaded = doneBytes + [...inFlight.values()].reduce((a, b) => a + b, 0);
		};

		const queue = urls.filter((p) => !done.has(p.partNumber));
		const uploadPart = async ({ partNumber, url }: MultipartUploadPartUrl) => {
			const { start, end } = partRange(partNumber, entry.partSize, entry.size);
			for (let attempt = 0; ; attempt++) {
				try {
					const etag = await this.putPart(
						url,
						file.slice(start, end),
						(loaded) => {
							inFlight.set(partNumber, loaded);
							report();
						},
						signal,
					);
					inFlight.delete(partNumber);
					done.set(partNumber, etag);
					doneBytes += end - start;
					report();
					return;
				} catch (e) {
					inFlight.delete(partNumber);
					report();
					const permanent = e instanceof PartError && e.permanent;
					if (isAbort(e) || permanent || attempt + 1 >= PART_ATTEMPTS) throw e;
					await sleep(retryDelay(attempt), signal);
				}
			}
		};

		try {
			await Promise.all(
				Array.from({ length: Math.min(PARALLEL_PARTS, queue.length) }, async () => {
					for (let next = queue.shift(); next; next = queue.shift()) await uploadPart(next);
				}),
			);
			state.status = "completing";
			const api = await this.api();
			await api.completeWebUpload({
				exportId,
				uploadId: entry.uploadId,
				parts: [...done].map(([partNumber, etag]) => ({ partNumber, etag })),
				form: entry.form,
			});
			this.forget(exportId);
			state.status = "done";
			state.loaded = entry.size;
		} catch (e) {
			if (signal.aborted) return;
			// the stored entry stays: choosing the same file continues where this stopped
			controller.abort();
			state.status = "interrupted";
			state.error = errorMessage(e);
		} finally {
			if (this.#controllers.get(exportId) === controller) this.#controllers.delete(exportId);
			await this.onChange();
		}
	}
}

/** The tab's uploads. Imports lazily, so pages without uploads don't load the remote functions. */
export const uploads = new UploadManager(
	async () => await import("#lib/components/exports/upload.remote.ts"),
	xhrPutPart,
	browserStorage,
	async () => {
		const { refreshAll } = await import("$app/navigation");
		await refreshAll();
	},
);

if (typeof window !== "undefined") {
	// leaving the page would stop the upload; the browser asks first
	window.addEventListener("beforeunload", (event) => {
		if (uploads.running.length > 0) event.preventDefault();
	});
}
