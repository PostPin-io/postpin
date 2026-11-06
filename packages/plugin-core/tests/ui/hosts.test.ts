import { describe, expect, it } from "vitest";
import { hostInfo } from "../../src/ui/hosts.ts";

describe("hostInfo", () => {
	it("returns the display name and an image URL for Resolve", () => {
		const info = hostInfo("Resolve");
		expect(info.displayName).toBe("DaVinci Resolve");
		expect(info.logo).toBeTypeOf("string");
		expect(info.logo as string).toMatch(/davinci-resolve.*\.png|^data:image\/png/);
	});

	it("returns monochrome paths for Pro Tools and Premiere Pro", () => {
		for (const name of ["Pro Tools", "Premiere Pro"]) {
			const { displayName, logo } = hostInfo(name);
			expect(displayName).toBe(name);
			expect(logo).toMatchObject({
				viewBox: expect.any(String),
				path: expect.stringMatching(/^M/),
			});
		}
	});

	it("has no logo for known hosts without one", () => {
		expect(hostInfo("Reaper")).toEqual({ displayName: "Reaper", logo: null });
	});

	it("falls back to the host name for unknown hosts", () => {
		expect(hostInfo("Avid")).toEqual({ displayName: "Avid", logo: null });
	});
});
