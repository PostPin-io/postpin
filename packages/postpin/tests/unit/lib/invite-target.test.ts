import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { InviteTarget, targetColumns } from "#lib/invite-target.ts";

describe("InviteTarget schema", () => {
	it.each(["organization", "project", "timeline"] as const)("accepts type %s", (type) => {
		expect(v.parse(InviteTarget, { type, id: "abc" })).toEqual({ type, id: "abc" });
	});

	it.each([
		["exports (shared via share links)", { type: "export", id: "abc" }],
		["unknown type", { type: "marker", id: "abc" }],
		["missing id", { type: "project" }],
		["non-string id", { type: "project", id: 1 }],
		["missing type", { id: "abc" }],
		["null", null],
	])("rejects %s", (_, input) => {
		expect(v.safeParse(InviteTarget, input).success).toBe(false);
	});

	it("strips unknown keys", () => {
		expect(v.parse(InviteTarget, { type: "project", id: "p", projectId: "x" })).toEqual({
			type: "project",
			id: "p",
		});
	});
});

describe("targetColumns", () => {
	it("organization → both null", () => {
		expect(targetColumns({ type: "organization", id: "org" })).toEqual({
			projectId: null,
			timelineId: null,
		});
	});

	it("project → projectId only", () => {
		expect(targetColumns({ type: "project", id: "p" })).toEqual({
			projectId: "p",
			timelineId: null,
		});
	});

	it("timeline → timelineId only", () => {
		expect(targetColumns({ type: "timeline", id: "t" })).toEqual({
			projectId: null,
			timelineId: "t",
		});
	});
});
