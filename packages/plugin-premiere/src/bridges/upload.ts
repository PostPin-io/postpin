import type { UploadedPart, UploadPartUrl, UploadProgress } from "@postpin-io/plugin-core/bridge";
import { fs } from "../host";

const UPLOAD_CONCURRENCY = 4;
const UPLOAD_PART_ATTEMPTS = 3;

export async function getFileSize(path: string): Promise<number> {
	return (await fs.lstat(path)).size;
}

// Reads only the part's bytes, previews can be several GB
async function readRange(path: string, start: number, length: number): Promise<ArrayBuffer> {
	const fd = await fs.open(path, "r");
	try {
		const buffer = new ArrayBuffer(length);
		const { bytesRead } = await fs.read(fd, buffer, 0, length, start);
		return bytesRead === length ? buffer : buffer.slice(0, bytesRead);
	} finally {
		await fs.close(fd);
	}
}

async function uploadPart(url: string, body: ArrayBuffer) {
	const res = await fetch(url, { method: "PUT", body });
	if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
	const etag = res.headers.get("etag");
	if (!etag) throw new Error("no ETag in response");
	return etag;
}

export async function uploadFile(
	path: string,
	partSize: number,
	parts: UploadPartUrl[],
	onProgress: (progress: UploadProgress) => void,
): Promise<UploadedPart[]> {
	const size = await getFileSize(path);
	const expectedPartCount = Math.max(1, Math.ceil(size / partSize));
	if (parts.length !== expectedPartCount) {
		throw new Error(`Expected ${expectedPartCount} upload URLs, got ${parts.length}`);
	}

	let uploadedBytes = 0;
	onProgress({ uploadedBytes, totalBytes: size });

	const queue = [...parts];
	const uploaded: UploadedPart[] = [];
	const worker = async () => {
		for (let part = queue.shift(); part; part = queue.shift()) {
			const start = (part.partNumber - 1) * partSize;
			const length = Math.min(partSize, size - start);
			for (let attempt = 1; ; attempt++) {
				try {
					const etag = await uploadPart(part.url, await readRange(path, start, length));
					uploaded.push({ partNumber: part.partNumber, etag });
					uploadedBytes += length;
					onProgress({ uploadedBytes, totalBytes: size });
					break;
				} catch (err) {
					if (attempt >= UPLOAD_PART_ATTEMPTS) {
						queue.length = 0;
						const message = err instanceof Error ? err.message : String(err);
						throw new Error(`Upload of part ${part.partNumber} failed: ${message}`);
					}
					await new Promise((r) => setTimeout(r, 1000 * attempt));
				}
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, parts.length) }, worker));
	return uploaded;
}
