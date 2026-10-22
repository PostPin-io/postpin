import type { Readable } from "node:stream";

const JPEG_START_SEQ = Buffer.from([0xff, 0xd8, 0xff]);

export async function* splitJPEGs(stream: Readable) {
	// ffmpeg writes the jpegs as one continuous stream, so we need to split them up into individual jpegs.
	// This can be done by looking for that start sequence and splitting the stream at those points.

	let pending = Buffer.alloc(0);
	for await (const chunk of stream) {
		pending = Buffer.concat([pending, chunk]);
		let next: number;
		while ((next = pending.indexOf(JPEG_START_SEQ, 1)) !== -1) {
			yield pending.subarray(0, next);
			pending = pending.subarray(next);
		}
	}
	// the last jpeg has no next start sequence to end it
	if (pending.length > 0) yield pending;
}
