import { describe, expect, it } from "vitest";
import { safeRedirect } from "#lib/redirect.ts";

describe("safeRedirect", () => {
	it.each(["/dashboard", "/projects/abc?tab=1#x", "/"])("keeps local path %j", (path) => {
		expect(safeRedirect(path)).toBe(path);
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["empty", ""],
		["absolute URL", "https://evil.com"],
		["protocol-relative", "//evil.com"],
		["backslash trick", "/\\evil.com"],
		["relative path", "dashboard"],
		["javascript:", "javascript:alert(1)"],
	])("falls back for %s", (_, target) => {
		expect(safeRedirect(target)).toBe("/dashboard");
	});

	it("uses the given fallback", () => {
		expect(safeRedirect("//evil.com", "/home")).toBe("/home");
	});

	it.each([
		["tab", "/\t/evil.com"],
		["newline", "/\n/evil.com"],
		["carriage return", "/\r/evil.com"],
	])("falls back when %s turns it into //host", (_, target) => {
		expect(safeRedirect(target)).toBe("/dashboard");
	});

	it("resolves to the same origin for every accepted path (WHATWG URL parser)", () => {
		for (const path of ["/a", "/\\evil.com", "/%2F%2Fevil.com", "/./evil.com"]) {
			const out = safeRedirect(path);
			expect(new URL(out, "https://postpin.test").origin, path).toBe("https://postpin.test");
		}
	});
});
