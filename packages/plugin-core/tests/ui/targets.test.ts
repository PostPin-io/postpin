import { describe, expect, it } from "vitest";
import { parseTargets, rememberTargets, targetsKey } from "../../src/ui/targets.ts";

describe("remembered targets", () => {
	const key = targetsKey("https://postpin.example", "tl-1");

	it("stores the targets per server and NLE timeline and reads them back", () => {
		const json = rememberTargets(undefined, key, {
			upload: { projectId: "p", timelineId: "t" },
			marker: { projectId: "p", timelineId: "t", exportId: "e" },
		});
		expect(parseTargets(json)[key]).toEqual({
			upload: { projectId: "p", timelineId: "t" },
			marker: { projectId: "p", timelineId: "t", exportId: "e" },
		});
		expect(parseTargets(json)[targetsKey("https://other.example", "tl-1")]).toBeUndefined();
	});

	it("replaces a timeline's entry and keeps the others", () => {
		let json = rememberTargets(undefined, "a", { upload: { projectId: "p", timelineId: "1" } });
		json = rememberTargets(json, "b", { upload: { projectId: "p", timelineId: "2" } });
		json = rememberTargets(json, "a", { upload: { projectId: "p", timelineId: "3" } });
		expect(parseTargets(json)).toEqual({
			b: { upload: { projectId: "p", timelineId: "2" } },
			a: { upload: { projectId: "p", timelineId: "3" } },
		});
	});

	it("drops the oldest timelines beyond the limit", () => {
		let json: string | undefined;
		for (let i = 0; i < 205; i++) json = rememberTargets(json, `k${i}`, {});
		const keys = Object.keys(parseTargets(json));
		expect(keys).toHaveLength(200);
		expect(keys[0]).toBe("k5");
	});

	it("reads broken or missing settings as nothing remembered", () => {
		expect(parseTargets(undefined)).toEqual({});
		expect(parseTargets("{nope")).toEqual({});
		expect(parseTargets("[1]")).toEqual({});
	});
});
