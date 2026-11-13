import { describe, expect, it } from "vitest";
import { mergeShotUrls } from "#lib/components/review/shot-thumbnail-urls.ts";

describe("mergeShotUrls", () => {
	it("the first answer as it is", () => {
		expect(mergeShotUrls(undefined, ["a1", null, null])).toEqual(["a1", null, null]);
	});

	it("shots already shown keep their URL, the ones that just got their image get the new one", () => {
		expect(mergeShotUrls(["a1", null, null], ["b1", "b2", null])).toEqual(["a1", "b2", null]);
	});

	it("follows the new answer's length", () => {
		expect(mergeShotUrls(["a1", "a2", "a3"], ["b1"])).toEqual(["a1"]);
	});
});
