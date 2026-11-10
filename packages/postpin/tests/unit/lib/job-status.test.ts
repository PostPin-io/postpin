import { describe, expect, it } from "vitest";
import { isJobRunning, totalJobProgress, type ProcessingJob } from "../../../src/lib/job-status.ts";

const job = (state: ProcessingJob["state"], progress = 0, weight = 1): ProcessingJob => ({
	id: `${state}-${progress}-${weight}`,
	label: state,
	state,
	progress,
	weight,
});

describe("totalJobProgress", () => {
	it("is 100 without jobs", () => {
		expect(totalJobProgress([])).toBe(100);
	});

	it("counts completed jobs fully and failed or delayed ones not at all", () => {
		expect(totalJobProgress([job("completed"), job("failed")])).toBe(50);
		expect(totalJobProgress([job("completed"), job("delayed")])).toBe(50);
	});

	it("uses the progress of active jobs", () => {
		expect(totalJobProgress([job("active", 0.5), job("completed")])).toBe(75);
	});

	it("weights the jobs", () => {
		expect(totalJobProgress([job("completed", 0, 3), job("waiting", 0, 1)])).toBe(75);
	});
});

describe("isJobRunning", () => {
	it.each(["active", "waiting", "delayed", "waiting-children", "prioritized"] as const)(
		"%s is running",
		(state) => expect(isJobRunning({ state })).toBe(true),
	);

	it.each(["completed", "failed", "unknown"] as const)("%s is finished", (state) =>
		expect(isJobRunning({ state })).toBe(false),
	);
});
