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
