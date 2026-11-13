import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CutListError } from "../../src/logic/cut-list.ts";
import { parseEdl, unsupportedCutList } from "../../src/logic/edl.ts";

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const line = (num: string, track: string, rec: string, reel = "AX") =>
	`${num}  ${reel}  ${track}  C  00:00:00:00 00:00:01:00 ${rec} 01:00:01:00`;

describe("parseEdl", () => {
	it("the video track and one track per audio channel, with the clip names", () => {
		const list = parseEdl(fixture("sample-resolve.edl"));
		expect(list).toMatchObject({ format: "edl", title: "Sample Timeline", frameRate: null });
		expect(list.tracks.map((t) => [t.type, t.name, t.events.length])).toEqual([
			["video", "Video 1", 2],
			["audio", "Audio 1", 1],
		]);
		expect(list.tracks[0]!.events).toEqual([
			{ name: "A001_C003.mov", in: "01:00:00:00", out: "01:00:04:00", sourceIn: "00:00:00:00" },
			// a dissolve with its duration field
			{ name: "B002.mov", in: "01:00:04:00", out: "01:00:08:00", sourceIn: "00:00:10:00" },
		]);
	});

	it("reads a real Resolve EDL completely", () => {
		const list = parseEdl(fixture("realedl.edl"));
		expect(list.tracks[0]!.events).toHaveLength(6);
		expect(list.tracks[0]!.events[0]).toMatchObject({ in: "01:00:00:00", sourceIn: "01:00:03:15" });
	});

	it.each([
		["A", ["Audio 1"]],
		["A2", ["Audio 2"]],
		["AA", ["Audio 1", "Audio 2"]],
		["AA/V", ["Video 1", "Audio 1", "Audio 2"]],
		["B", ["Video 1", "Audio 1"]],
		["A3/A4", ["Audio 3", "Audio 4"]],
		["NONE", []],
	])("track field %s goes to %j", (track, names) => {
		const text = `TITLE: x\n${line("001", "V", "01:00:05:00")}\n${line("002", track, "01:00:00:00")}\n`;
		// event 1 only makes the EDL valid; event 2 is the one under test
		const withEvent2 = parseEdl(text).tracks.filter((t) =>
			t.events.some((e) => e.in === "01:00:00:00"),
		);
		expect(withEvent2.map((t) => t.name)).toEqual(names);
	});

	it("audio tracks in channel order, the comment names every channel of its event", () => {
		const text = `TITLE: x
${line("001", "V", "01:00:00:00")}
${line("002", "A4", "01:00:00:00")}
${line("003", "AA", "01:00:00:00")}
* FROM CLIP NAME: sound.wav
`;
		const list = parseEdl(text);
		expect(list.tracks.map((t) => t.name)).toEqual(["Video 1", "Audio 1", "Audio 2", "Audio 4"]);
		expect(list.tracks[1]!.events[0]!.name).toBe("sound.wav");
		expect(list.tracks[2]!.events[0]!.name).toBe("sound.wav");
	});

	it("leaves out black and silence, and lines like M2 speed changes", () => {
		const text = `TITLE: x
${line("001", "V", "01:00:00:00", "BL")}
${line("002", "A", "01:00:00:00", "BL")}
${line("003", "V", "01:00:01:00")}
M2   AX       050.0          00:00:00:00
`;
		const list = parseEdl(text);
		expect(list.tracks).toHaveLength(1);
		expect(list.tracks[0]!.events).toHaveLength(1);
	});

	it("accepts drop-frame timecodes, CRLF and a BOM", () => {
		const text = "﻿TITLE: x\r\n001  AX  V  C  01:00:00;00 01:00:01;00 01:00:00;00 01:00:01;00\r\n";
		expect(parseEdl(text).tracks[0]!.events[0]!.in).toBe("01:00:00;00");
	});

	it.each([
		["a file without TITLE", line("001", "V", "01:00:00:00"), /first line/],
		[
			"an invalid timecode",
			"TITLE: x\n001  AX  V  C  00:00:0 00:00:01:00 01:00:00:00 01:00:01:00",
			/Line 2/,
		],
		[
			"audio only",
			`TITLE: x\n${line("001", "A", "01:00:00:00")}`,
			/no video events and no markers/,
		],
	])("rejects %s", (_, text, message) => {
		expect(() => parseEdl(text)).toThrow(CutListError);
		expect(() => parseEdl(text)).toThrow(message);
	});
});

describe("parseEdl: markers", () => {
	it("Resolve's timeline markers: an event of their own with color, name and length", () => {
		// Resolve's "Timeline Markers" EDL: every marker is a one-frame event
		const text = `TITLE: Markers
FCM: NON-DROP FRAME

001  001      V     C        01:00:05:00 01:00:05:01 01:00:05:00 01:00:05:01
 |C:ResolveColorBlue |M:Fix the grade |D:1

002  001      V     C        01:00:10:00 01:00:12:00 01:00:10:00 01:00:12:00
 |C:ResolveColorRed |M:Music too loud |D:50
`;
		const list = parseEdl(text);
		// no clips: those events only carry the markers
		expect(list.tracks).toEqual([]);
		expect(list.markers).toEqual([
			{
				name: "Fix the grade",
				note: null,
				at: "01:00:05:00",
				duration: 0,
				host: "Resolve",
				label: "Blue",
			},
			{
				name: "Music too loud",
				note: null,
				at: "01:00:10:00",
				duration: 50,
				host: "Resolve",
				label: "Red",
			},
		]);
	});

	it("a marker comment under a clip event keeps the clip", () => {
		const text = `TITLE: x
${line("001", "V", "01:00:00:00")}
* FROM CLIP NAME: A001.mov
|C:ResolveColorGreen |M:Nice |D:1
`;
		const list = parseEdl(text);
		expect(list.tracks[0]!.events).toHaveLength(1);
		expect(list.markers).toMatchObject([{ name: "Nice", at: "01:00:00:00", label: "Green" }]);
	});

	it("Avid's locators, at their own timecode", () => {
		const text = `TITLE: x
${line("001", "V", "01:00:00:00")}
* LOC: 01:00:00:12 RED     Fix the grade
* LOC: 01:00:00:20 GREEN
`;
		expect(parseEdl(text).markers).toEqual([
			{
				name: "Fix the grade",
				note: null,
				at: "01:00:00:12",
				duration: 0,
				host: "Avid",
				label: "RED",
			},
			{ name: "Marker", note: null, at: "01:00:00:20", duration: 0, host: "Avid", label: "GREEN" },
		]);
	});

	it("without clips and without markers, there is nothing to read", () => {
		expect(() => parseEdl(`TITLE: x\n${line("001", "A", "01:00:00:00")}`)).toThrow(
			/no video events and no markers/,
		);
	});
});

describe("unsupportedCutList", () => {
	const bytes = (...b: number[]) => new Uint8Array(b);
	const AAF = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x01, 0x02);
	const text = (s: string) => new TextEncoder().encode(s);

	it.each([
		["an AAF by its bytes, whatever its name", AAF, "Main.edl", /AAF files can't be read/],
		["an AAF by its name", text("x"), "Main.aaf", /AAF files can't be read/],
		["a Resolve project", text("x"), "Main.drp", /Project files/],
		["a Premiere project", text("x"), "Cut.prproj", /Project files/],
		["anything else binary", bytes(0x50, 0x4b, 0x03, 0x04, 0x00), "cut.zip", /no text file/],
	])("%s", (_, head, name, message) => {
		expect(unsupportedCutList(head, name)).toMatch(message);
		expect(unsupportedCutList(head, name)).toMatch(/EDL or as FCPXML instead/);
	});

	it.each([
		["an EDL", "TITLE: x\n001", "cut.edl"],
		["an FCPXML", "<?xml version='1.0'?><fcpxml>", "Info.fcpxml"],
	])("%s is fine", (_, content, name) => {
		expect(unsupportedCutList(text(content), name)).toBeNull();
	});
});
