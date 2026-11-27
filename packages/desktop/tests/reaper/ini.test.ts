import { describe, expect, it } from "vitest";
import {
	ACTION_ID,
	hasAction,
	hasWebInterface,
	withAction,
	withWebInterface,
} from "../../src/adapters/reaper/ini.ts";

const endpoint = { port: 51234, password: "abc123" };
const ours = "HTTP 0 51234 'postpin:abc123' '' 0 ''";

// as REAPER 7.86 writes it, with the user's own web interface
const INI = [
	"[REAPER]",
	"autosaveint=5",
	"csurf_0=HTTP 0 8389 '' 'more_me.html' 0 ''",
	"csurf_cnt=1",
	"lastproject=/Users/me/Ä.rpp",
	"",
	"[audioconfig]",
	"srate=48000",
	"",
].join("\n");

describe("withWebInterface", () => {
	it("adds ours after the user's web interfaces and counts both", () => {
		const out = withWebInterface(INI, endpoint);
		expect(out).toContain("csurf_0=HTTP 0 8389 '' 'more_me.html' 0 ''");
		expect(out).toContain(`csurf_1=${ours}`);
		expect(out).toContain("csurf_cnt=2");
		expect(hasWebInterface(out, endpoint)).toBe(true);
	});

	it("keeps everything else and the other sections as they were", () => {
		const out = withWebInterface(INI, endpoint);
		expect(out).toBe(INI.replace("csurf_cnt=1", `csurf_1=${ours}\ncsurf_cnt=2`));
		expect(out).toContain("autosaveint=5\n");
		expect(out).toContain("lastproject=/Users/me/Ä.rpp\n");
		expect(out.endsWith("\n\n[audioconfig]\nsrate=48000\n")).toBe(true);
	});

	it("replaces an earlier one of ours and renumbers the rest", () => {
		const earlier = withWebInterface(INI, { port: 40000, password: "old" });
		const ini = earlier.replace("csurf_cnt=2", "csurf_2=OSC 0 9000\ncsurf_cnt=3");
		const out = withWebInterface(ini, endpoint);
		expect(out).not.toContain("40000");
		expect(out).toContain("csurf_0=HTTP 0 8389");
		expect(out).toContain("csurf_1=OSC 0 9000");
		expect(out).toContain(`csurf_2=${ours}`);
		expect(out).toContain("csurf_cnt=3");
	});

	it("works without any control surface yet, and with Windows line ends", () => {
		const ini = "[REAPER]\r\nautosaveint=5\r\n[other]\r\nx=1\r\n";
		const out = withWebInterface(ini, endpoint);
		expect(out).toBe(
			`[REAPER]\r\nautosaveint=5\r\ncsurf_0=${ours}\r\ncsurf_cnt=1\r\n[other]\r\nx=1\r\n`,
		);
	});

	it("doesn't count a web interface on another port or password as set up", () => {
		const out = withWebInterface(INI, { port: 40000, password: "old" });
		expect(hasWebInterface(out, endpoint)).toBe(false);
		expect(hasWebInterface(INI, endpoint)).toBe(false);
	});

	it("refuses a file without a [REAPER] section", () => {
		expect(() => withWebInterface("[audioconfig]\nsrate=1\n", endpoint)).toThrow("[REAPER]");
	});
});

describe("withAction", () => {
	const KB = 'SCR 4 0 RS123 "Custom: lyrics.lua" Cockos/lyrics.lua\nKEY 1 65 40001 0\n';

	it("adds the bridge action once, after the user's", () => {
		const out = withAction(KB);
		expect(out.startsWith(KB)).toBe(true);
		expect(hasAction(out)).toBe(true);
		expect(withAction(out)).toBe(out);
		expect(out.split(ACTION_ID)).toHaveLength(2);
	});

	it("replaces an older line of ours", () => {
		const old = `${KB}SCR 4 0 ${ACTION_ID} "Custom: old" PostPin/old.lua\n`;
		const out = withAction(old);
		expect(out).not.toContain("old.lua");
		expect(hasAction(out)).toBe(true);
	});

	it("works on an empty file", () => {
		expect(hasAction(withAction(""))).toBe(true);
		expect(hasAction("")).toBe(false);
	});
});
