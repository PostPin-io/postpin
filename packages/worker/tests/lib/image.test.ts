import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { splitJPEGs } from "../../src/lib/image.ts";

const SOI = [0xff, 0xd8, 0xff];
const jpeg = (...body: number[]) => Buffer.from([...SOI, 0xe0, ...body, 0xff, 0xd9]);

async function split(chunks: Buffer[]) {
	const out: Buffer[] = [];
	for await (const image of splitJPEGs(Readable.from(chunks))) out.push(Buffer.from(image));
	return out;
}

describe("splitJPEGs", () => {
	it("yields nothing for an empty stream", async () => {
		expect(await split([])).toEqual([]);
	});

	it("yields a single JPEG unchanged", async () => {
		const a = jpeg(1, 2, 3);
		expect(await split([a])).toEqual([a]);
	});

	it("splits concatenated JPEGs at each start sequence", async () => {
		const a = jpeg(1);
		const b = jpeg(2, 2);
		const c = jpeg(3, 3, 3);
		expect(await split([Buffer.concat([a, b, c])])).toEqual([a, b, c]);
	});

	it("handles JPEGs spread over many chunks, including a start sequence split across chunks", async () => {
		const a = jpeg(1, 2, 3, 4);
		const b = jpeg(5, 6, 7, 8);
		const all = Buffer.concat([a, b]);
		// cut right inside b's FF D8 FF
		const cut = a.length + 2;
		expect(await split([all.subarray(0, 3), all.subarray(3, cut), all.subarray(cut)])).toEqual([
			a,
			b,
		]);
		// one byte per chunk
		expect(await split([...all].map((byte) => Buffer.from([byte])))).toEqual([a, b]);
	});

	it("does not split at a lone FF D8 that isn't followed by FF", async () => {
		const a = jpeg(0xff, 0xd8, 0x00, 0x01);
		expect(await split([a])).toEqual([a]);
	});
});
