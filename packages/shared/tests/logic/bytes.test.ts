import { describe, expect, it } from "vitest";
import { formatByteSize, isByteSize, parseByteSize } from "../../src/logic/bytes.ts";

describe("parseByteSize", () => {
	it.each([
		["1000", 1000n],
		["0", 0n],
		["50 GB", 50_000_000_000n],
		["50GB", 50_000_000_000n],
		[" 2 gb ", 2_000_000_000n],
		["1.5 TB", 1_500_000_000_000n],
		["12 KiB", 12_288n],
		["1.5 TiB", 1_649_267_441_664n],
		["1 PB", 10n ** 15n],
	])("%j → %s", (input, bytes) => {
		expect(parseByteSize(input)).toBe(bytes);
	});

	it.each(["", "GB", "50 GBB", "-1 GB", "1,5 GB", "1e9", "50 EB"])("rejects %j", (input) => {
		expect(() => parseByteSize(input)).toThrow(/Invalid byte size/);
		expect(isByteSize(input)).toBe(false);
	});
});

describe("formatByteSize", () => {
	it.each([
		[0, "0 B"],
		[999, "999 B"],
		[1000, "1 KB"],
		[1_234_567n, "1.23 MB"],
		[50_000_000_000n, "50 GB"],
		[46_570_000_000, "46.6 GB"],
		[1_500_000_000_000n, "1.5 TB"],
	])("%s → %j", (bytes, text) => {
		expect(formatByteSize(bytes)).toBe(text);
	});

	it("round-trips decimal sizes", () => {
		for (const size of ["50 GB", "1.5 TB", "200 MB", "7 KB"]) {
			expect(formatByteSize(parseByteSize(size))).toBe(size);
		}
	});

	it("rejects negative sizes", () => {
		expect(() => formatByteSize(-1)).toThrow();
	});
});
