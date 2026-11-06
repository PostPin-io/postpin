import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/errors.ts";

describe("errorMessage", () => {
	it("returns an Error's message", () => {
		expect(errorMessage(new TypeError("boom"))).toBe("boom");
	});

	it("returns the message of an API error body", () => {
		expect(errorMessage({ message: "Not found", status: 404 })).toBe("Not found");
		expect(errorMessage({ message: 42 })).toBe("42");
	});

	it("stringifies anything else", () => {
		expect(errorMessage("plain")).toBe("plain");
		expect(errorMessage(null)).toBe("null");
		expect(errorMessage(undefined)).toBe("undefined");
		expect(errorMessage({ error: "x" })).toBe("[object Object]");
	});
});
