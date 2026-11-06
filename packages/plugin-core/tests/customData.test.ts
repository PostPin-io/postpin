import { describe, expect, it } from "vitest";
import { POSTPIN_DATA_VERSION, parsePostPinData, stringifyPostPinData } from "../src/customData.ts";

describe("parsePostPinData", () => {
	it("returns PostPin's data with its version", () => {
		expect(parsePostPinData('{"__postpin":1,"id":"m1","frame":10}')).toEqual({
			__postpin: 1,
			id: "m1",
			frame: 10,
		});
	});

	it("keeps newer versions as they are", () => {
		expect(parsePostPinData('{"__postpin":2,"id":"m1"}')).toEqual({ __postpin: 2, id: "m1" });
	});

	it("treats the unversioned '__postpin: true' as version 1", () => {
		expect(parsePostPinData('{"__postpin":true,"id":"m1"}')).toEqual({ __postpin: 1, id: "m1" });
	});

	it.each([
		["null", null],
		["an empty string", ""],
		["invalid JSON", "{nope"],
		["plain text from another tool", "approved by director"],
		["JSON null", "null"],
		["a number", "42"],
		["an array", '[{"__postpin":1}]'],
		["an object without the marker", '{"id":"m1"}'],
		["a string version", '{"__postpin":"1"}'],
		["a false marker", '{"__postpin":false}'],
		["a null marker", '{"__postpin":null}'],
	])("returns null for %s", (_, customData) => {
		expect(parsePostPinData(customData)).toBeNull();
	});
});

describe("stringifyPostPinData", () => {
	it("writes the current version as the first key", () => {
		expect(stringifyPostPinData({ id: "m1", frame: 3 })).toBe(
			`{"__postpin":${POSTPIN_DATA_VERSION},"id":"m1","frame":3}`,
		);
	});

	it("replaces a version passed in with the current one", () => {
		const data = { __postpin: 99, id: "m1" } as Parameters<typeof stringifyPostPinData>[0];
		expect(JSON.parse(stringifyPostPinData(data))).toEqual({
			__postpin: POSTPIN_DATA_VERSION,
			id: "m1",
		});
	});

	it("round-trips through parsePostPinData", () => {
		expect(parsePostPinData(stringifyPostPinData({ id: "m1", nleId: "n1" }))).toEqual({
			__postpin: POSTPIN_DATA_VERSION,
			id: "m1",
			nleId: "n1",
		});
	});
});
