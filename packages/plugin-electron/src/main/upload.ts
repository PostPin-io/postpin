import type { UploadedPart, UploadPartUrl, UploadProgress } from "@postpin-io/plugin-core/bridge";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";

const UPLOAD_CONCURRENCY = 4;
const UPLOAD_PART_ATTEMPTS = 3;
const UPLOAD_PROGRESS_INTERVAL_MS = 200;

// PUTs the byte range [start, end] of the file and returns the ETag S3 assigned to the part.
async function uploadPart(
	sourcePath: string,
	uploadUrl: string,
	start: number,
	end: number,
	onBytes: (byteCount: number) => void,
) {
	const url = new URL(uploadUrl);

	const request = (url.protocol === "https:" ? https : http).request(url, {
		method: "PUT",
		headers: { "Content-Length": end - start + 1 },
	});
	const response = new Promise<IncomingMessage>((resolve, reject) => {
		request.once("response", resolve);
		request.once("error", reject);
	});

	const source = createReadStream(sourcePath, { start, end });
	source.on("data", (chunk) => onBytes(chunk.length));
	const [, res] = await Promise.all([pipeline(source, request), response]);

	let body = "";
	for await (const chunk of res) body += chunk;
	if (!res.statusCode || res.statusCode >= 300) {
		throw new Error(`status ${res.statusCode}: ${body}`);
	}

	const etag = res.headers.etag;
	if (!etag) throw new Error("no ETag in response");
	return etag;
}

// uploads the file as S3 multipart upload in chunks
export async function uploadFile(
	sourcePath: string,
	partSize: number,
	parts: UploadPartUrl[],
	onProgress: (progress: UploadProgress) => void,
): Promise<UploadedPart[]> {
	const { size } = await stat(sourcePath);
	const expectedPartCount = Math.max(1, Math.ceil(size / partSize));
	if (parts.length !== expectedPartCount) {
		throw new Error(`Expected ${expectedPartCount} upload URLs, got ${parts.length}`);
	}

	let uploadedBytes = 0;
	let lastProgressAt = 0;
	const reportProgress = (force = false) => {
		const now = Date.now();
		if (!force && now - lastProgressAt < UPLOAD_PROGRESS_INTERVAL_MS) return;
		lastProgressAt = now;
		onProgress({ uploadedBytes, totalBytes: size });
	};
	reportProgress(true);

	const queue = [...parts];
	const uploaded: UploadedPart[] = [];
	const worker = async () => {
		for (let part = queue.shift(); part; part = queue.shift()) {
			const start = (part.partNumber - 1) * partSize;
			const end = Math.min(start + partSize, size) - 1;
			for (let attempt = 1; ; attempt++) {
				let partBytes = 0;
				try {
					const etag = await uploadPart(sourcePath, part.url, start, end, (byteCount) => {
						partBytes += byteCount;
						uploadedBytes += byteCount;
						reportProgress();
					});
					uploaded.push({ partNumber: part.partNumber, etag });
					break;
				} catch (err) {
					// The part starts over, so its bytes no longer count
					uploadedBytes -= partBytes;
					if (attempt >= UPLOAD_PART_ATTEMPTS) {
						// Stop the other workers from picking up more parts
						queue.length = 0;
						const message = err instanceof Error ? err.message : String(err);
						throw new Error(`Upload of part ${part.partNumber} failed: ${message}`);
					}
					await sleep(1000 * attempt);
				}
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, parts.length) }, worker));

	reportProgress(true);
	return uploaded;
}
