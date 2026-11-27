import { describe, expect, it } from "vitest";
import { hostInfo } from "../../src/ui/hosts.ts";

describe("hostInfo", () => {
	it("returns the display name and an image URL for Resolve", () => {
		const info = hostInfo("Resolve");
		expect(info.displayName).toBe("DaVinci Resolve");
		expect(info.logo).toBeTypeOf("string");
		expect(info.logo as string).toMatch(/davinci-resolve.*\.png|^data:image\/png/);
	});

	it("returns app icon URLs for Pro Tools, Premiere Pro and REAPER", () => {
		for (const [name, file] of [
			["Pro Tools", "pro-tools"],
			["Premiere Pro", "premiere-pro"],
			["REAPER", "reaper"],
		]) {
			const { displayName, logo } = hostInfo(name);
			expect(displayName).toBe(name);
			expect(logo).toBeTypeOf("string");
			expect(logo as string).toMatch(new RegExp(`${file}.*\\.png|^data:image/png`));
		}
	});

	it("has no logo for known hosts without one", () => {
		expect(hostInfo("Baselight")).toEqual({ displayName: "Baselight", logo: null });
	});

	it("falls back to the host name for unknown hosts", () => {
		expect(hostInfo("Avid")).toEqual({ displayName: "Avid", logo: null });
	});
});
