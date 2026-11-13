import { describe, expect, it } from "vitest";
import {
	POSTPIN_API_VERSION,
	releaseApiVersionUrl,
	releaseDownloadUrl,
} from "../src/api-version.ts";

describe("POSTPIN_API_VERSION", () => {
	it("is a positive integer", () => {
		expect(Number.isInteger(POSTPIN_API_VERSION) && POSTPIN_API_VERSION > 0).toBe(true);
	});
});

describe("releaseDownloadUrl", () => {
	it.each(["1.4.2", "2.0.0-beta.1", "10.20.30-rc1"])("links release %s", (release) => {
		expect(releaseDownloadUrl(release)).toBe(
			`https://github.com/PostPin-io/postpin/releases/tag/v${release}`,
		);
	});

	it.each(["0.0.1+abc123", "0.0.1+1700000000-unknown", "test", "", null, undefined])(
		"no link for %s, which isn't a release",
		(release) => {
			expect(releaseDownloadUrl(release)).toBeNull();
		},
	);
});

describe("releaseApiVersionUrl", () => {
	it("points at the release's asset", () => {
		expect(releaseApiVersionUrl("1.4.2")).toBe(
			"https://github.com/PostPin-io/postpin/releases/download/v1.4.2/api-version.json",
		);
	});
});
