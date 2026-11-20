import { describe, expect, it } from "vitest";
import { installStepsFor } from "#lib/components/guides/tutorials/install-steps.ts";

describe("installStepsFor", () => {
	it("has the security prompt only where there is one, before installing", () => {
		expect(installStepsFor("mac", ["windows"])).toEqual([
			"download",
			"install",
			"open-in-nle",
			"connect",
			"done",
		]);
		expect(installStepsFor("windows", ["windows"])).toEqual([
			"download",
			"os-security",
			"install",
			"open-in-nle",
			"connect",
			"done",
		]);
		expect(installStepsFor("mac", ["mac", "windows"])).toContain("os-security");
	});
});
