import { describe, expect, it } from "vitest";
import { formatDuration, formatLoginCode, formatMegabytes } from "../../src/ui/format.ts";

describe("formatMegabytes", () => {
	it("rounds to whole MiB", () => {
		expect(formatMegabytes(0)).toBe("0 MB");
		expect(formatMegabytes(1.4 * 1024 * 1024)).toBe("1 MB");
		expect(formatMegabytes(1.6 * 1024 * 1024)).toBe("2 MB");
		expect(formatMegabytes(5 * 1024 ** 3)).toBe("5120 MB");
	});
});

describe("formatDuration", () => {
	it.each([
		[0, "0:00"],
		[1499, "0:01"],
		[59_400, "0:59"],
		// rounds up into the next minute instead of showing 0:60
		[59_500, "1:00"],
		[61_000, "1:01"],
		[3_600_000, "60:00"],
	])("formats %i ms as %s", (ms, expected) => {
		expect(formatDuration(ms)).toBe(expected);
	});
});

describe("formatLoginCode", () => {
	it("splits 8-character codes in half", () => {
		expect(formatLoginCode("ABCDEFGH")).toBe("ABCD-EFGH");
	});

	it("leaves other lengths alone", () => {
		expect(formatLoginCode("ABC")).toBe("ABC");
		expect(formatLoginCode("ABCD-EFGH")).toBe("ABCD-EFGH");
	});
});
