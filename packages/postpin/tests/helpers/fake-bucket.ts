import { partLayout } from "@postpin-io/shared/storage";
import { fakes, type S3Call } from "./fakes.ts";

/**
 * Makes `fakes.s3` answer ListObjectsV2 from the given keys (one page per call,
 * `pageSize` keys each), and returns helpers to read what was deleted.
 */
export function fakeBucket(keys: string[], pageSize = 1000) {
	fakes.s3Respond = (call: S3Call) => {
		if (call.command !== "ListObjectsV2Command") return {};
		const prefix = String(call.input.Prefix ?? "");
		const start = Number(call.input.ContinuationToken ?? 0);
		const matching = keys.filter((k) => k.startsWith(prefix));
		const page = matching.slice(start, start + pageSize);
		const next = start + pageSize < matching.length ? String(start + pageSize) : undefined;
		return { Contents: page.map((Key) => ({ Key })), NextContinuationToken: next };
	};
	return {
		/** Every key sent in a DeleteObjects call, in order */
		deletedKeys: () =>
			fakes.s3
				.filter((c) => c.command === "DeleteObjectsCommand")
				.flatMap((c) =>
					(c.input.Delete as { Objects: { Key: string }[] }).Objects.map((o) => o.Key),
				),
		listedPrefixes: () =>
			fakes.s3.filter((c) => c.command === "ListObjectsV2Command").map((c) => c.input.Prefix),
	};
}

/**
 * A multipart upload in `fakes.s3` that remembers its parts: ListParts answers with them,
 * CompleteMultipartUpload stores the object from the named parts (HeadObject then answers its
 * size), Abort and DeleteObject forget. Other commands answer `{}`.
 */
export function fakeMultipart(uploadId = "upload-1") {
	let parts = new Map<number, { etag: string; size: number }>();
	let objectSize: number | null = null;
	let afterComplete = (size: number) => size;
	fakes.s3Respond = (call: S3Call) => {
		switch (call.command) {
			case "CreateMultipartUploadCommand":
				return { UploadId: uploadId };
			case "ListPartsCommand":
				if (call.input.UploadId !== uploadId) throw new Error("NoSuchUpload");
				return {
					Parts: [...parts].map(([PartNumber, p]) => ({
						PartNumber,
						ETag: p.etag,
						Size: p.size,
					})),
				};
			case "CompleteMultipartUploadCommand": {
				const named = (call.input.MultipartUpload as { Parts: { PartNumber: number }[] }).Parts;
				objectSize = afterComplete(
					named.reduce((sum, p) => sum + (parts.get(p.PartNumber)?.size ?? 0), 0),
				);
				parts = new Map();
				return {};
			}
			case "HeadObjectCommand":
				if (objectSize === null) throw new Error("NotFound");
				return { ContentLength: objectSize };
			case "AbortMultipartUploadCommand":
				parts = new Map();
				return {};
			case "DeleteObjectCommand":
				objectSize = null;
				return {};
			default:
				return {};
		}
	};
	return {
		/** S3 received part `partNumber` with `size` bytes; returns the part as a client completes it */
		put(partNumber: number, size: number, etag = `"e${partNumber}"`) {
			parts.set(partNumber, { etag, size });
			return { partNumber, etag };
		},
		/** Every part of a file of `fileSize` bytes, of the right size */
		putFile(fileSize: number) {
			const { partSize, partCount } = partLayout(fileSize);
			return Array.from({ length: partCount }, (_, i) =>
				this.put(i + 1, i + 1 < partCount ? partSize : fileSize - partSize * (partCount - 1)),
			);
		},
		/** Changes the assembled object's size, as if a part was replaced after the check */
		onComplete(fn: (size: number) => number) {
			afterComplete = fn;
		},
		objectSize: () => objectSize,
	};
}
