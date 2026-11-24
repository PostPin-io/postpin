import { describe, expect, it } from "vitest";
import {
	DOWNLOADS_URL,
	detectOs,
	isHostedServer,
	pluginInstaller,
	releaseVersion,
} from "#lib/downloads.ts";

describe("releaseVersion", () => {
	it("takes the release out of a build version", () => {
		expect(releaseVersion("0.5.2")).toBe("0.5.2");
		expect(releaseVersion("0.5.2+abc123-dirty")).toBe("0.5.2");
		expect(releaseVersion("1.0.0-rc.1")).toBe("1.0.0-rc.1");
		expect(releaseVersion("v1.2.3")).toBe("1.2.3");
	});

	it("is null for builds without a release", () => {
		expect(releaseVersion("ci-0123abc")).toBeNull();
		expect(releaseVersion("latest")).toBeNull();
	});
});

describe("pluginInstaller", () => {
	it("points at the installer of the same release", () => {
		expect(pluginInstaller("resolve", "mac", "0.5.2+abc")).toEqual({
			url: "https://github.com/PostPin-io/postpin/releases/download/v0.5.2/PostPin-Resolve-0.5.2.pkg",
			file: "PostPin-Resolve-0.5.2.pkg",
		});
		expect(pluginInstaller("resolve", "windows", "0.5.2").file).toBe("PostPin-Resolve-0.5.2.exe");
	});

	it("has one .ccx for Premiere on both systems", () => {
		expect(pluginInstaller("premiere", "mac", "0.5.2").file).toBe("PostPin-Premiere-0.5.2.ccx");
		expect(pluginInstaller("premiere", "windows", "0.5.2").file).toBe("PostPin-Premiere-0.5.2.ccx");
	});

	it("names the desktop app as electron-builder does", () => {
		expect(pluginInstaller("desktop", "mac", "0.5.2").file).toBe(
			"PostPin-Desktop-0.5.2-universal.dmg",
		);
		expect(pluginInstaller("desktop", "windows", "0.5.2").file).toBe(
			"PostPin-Desktop-0.5.2-x64.exe",
		);
	});

	it("falls back to the downloads page", () => {
		expect(pluginInstaller("premiere", "mac", "ci-0123abc")).toEqual({
			url: DOWNLOADS_URL,
			file: null,
		});
	});
});

describe("detectOs", () => {
	it("tells Windows from the rest", () => {
		expect(detectOs("Windows")).toBe("windows");
		expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
		expect(detectOs("macOS")).toBe("mac");
		expect(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
		expect(detectOs("")).toBe("mac");
	});
});

describe("isHostedServer", () => {
	it("is the server the plugins use unless told otherwise", () => {
		expect(isHostedServer("https://postpin.io")).toBe(true);
		expect(isHostedServer("https://review.studio.example")).toBe(false);
		expect(isHostedServer("http://localhost:5173", true)).toBe(true);
		expect(isHostedServer("http://localhost:5173")).toBe(false);
	});
});
