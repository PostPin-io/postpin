import { describe, expect, it } from "vitest";
import {
	checkCutListAt,
	cutListSummaryText,
	readCutListFile,
	readDroppedCutList,
} from "#lib/upload/cut-list-file.ts";

const FPS_25 = { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };
const EDL = `TITLE: Trailer
001  AX  V  C  00:00:00:00 00:00:04:00 01:00:00:00 01:00:04:00
* FROM CLIP NAME: A001.mov
|C:ResolveColorBlue |M:Fix the grade |D:1
002  AX  A  C  00:00:00:00 00:00:04:00 01:00:00:00 01:00:04:00
`;
const FCPXML = `<?xml version="1.0"?><fcpxml version="1.11"><resources>
	<format id="r0" frameDuration="1/25s"/><asset id="r1" name="A.mov" hasVideo="1" format="r0"/>
</resources><library><event><project name="P"><sequence format="r0" tcStart="3600s" duration="4s"><spine>
	<asset-clip ref="r1" name="A.mov" offset="3600s" start="0s" duration="4s"><marker start="1s" duration="1/25s" value="Hi"/></asset-clip>
</spine></sequence></project></event></library></fcpxml>`;
const file = (content: BlobPart, name: string) => new File([content], name);

describe("readCutListFile", () => {
	it("an EDL", async () => {
		const read = await readCutListFile(file(EDL, "cut.edl"));
		expect(read).toMatchObject({ ok: true, name: "cut.edl", list: { format: "edl" } });
	});

	it("an FCPXML, whatever its extension", async () => {
		const read = await readCutListFile(file(FCPXML, "Info.xml"));
		expect(read).toMatchObject({ ok: true, list: { format: "fcpxml", markers: [{ name: "Hi" }] } });
	});

	it("an AAF says what to export instead", async () => {
		const aaf = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
		expect(await readCutListFile(file(aaf, "Main.aaf"))).toEqual({
			ok: false,
			name: "Main.aaf",
			error: "AAF files can't be read here. Export the timeline as an EDL or as FCPXML instead",
		});
	});

	it("text that is neither says why", async () => {
		expect(await readCutListFile(file("hello", "notes.txt"))).toMatchObject({
			ok: false,
			error: expect.stringMatching(/Not an EDL/),
		});
	});
});

describe("readDroppedCutList", () => {
	it("nothing dropped, nothing read", async () => {
		expect(await readDroppedCutList(null)).toBeNull();
	});

	it("a dropped file", async () => {
		const data = { items: [], files: [file(EDL, "cut.edl")] } as unknown as DataTransfer;
		expect(await readDroppedCutList(data)).toMatchObject({ ok: true, name: "cut.edl" });
	});

	it("a dropped .fcpxmld bundle: the Info.fcpxml inside, under the bundle's name", async () => {
		const info = file(FCPXML, "Info.fcpxml");
		const entry = {
			isDirectory: true,
			name: "Main.fcpxmld",
			getFile: (path: string, _o: unknown, ok: (f: unknown) => void) =>
				ok({ file: (resolve: (f: File) => void) => resolve(info), path }),
		};
		const data = {
			items: [{ webkitGetAsEntry: () => entry }],
			files: [],
		} as unknown as DataTransfer;
		expect(await readDroppedCutList(data)).toMatchObject({
			ok: true,
			name: "Main.fcpxmld",
			list: { format: "fcpxml" },
		});
	});

	it("a dropped folder without Info.fcpxml", async () => {
		const entry = {
			isDirectory: true,
			name: "Footage",
			getFile: (_p: string, _o: unknown, _ok: unknown, fail: () => void) => fail(),
		};
		const data = {
			items: [{ webkitGetAsEntry: () => entry }],
			files: [],
		} as unknown as DataTransfer;
		expect(await readDroppedCutList(data)).toEqual({
			ok: false,
			name: "Footage",
			error: "This folder has no Info.fcpxml",
		});
	});
});

describe("checkCutListAt and cutListSummaryText", () => {
	it("what is in a list that fits the rate", async () => {
		const read = await readCutListFile(file(EDL, "cut.edl"));
		const check = checkCutListAt(read.ok ? read.list : (null as never), FPS_25);
		expect(check).toMatchObject({ ok: true, videoClips: 1, audioTracks: 1, markers: 1 });
		expect(cutListSummaryText(check as never)).toBe(
			"1 video clip on 1 track, 1 audio track, 1 marker",
		);
	});

	it("a timecode the rate doesn't have", async () => {
		const read = await readCutListFile(
			file(EDL.replace("01:00:04:00\n* FROM", "01:00:03:29\n* FROM"), "cut.edl"),
		);
		expect(checkCutListAt(read.ok ? read.list : (null as never), FPS_25)).toMatchObject({
			ok: false,
			error: expect.stringMatching(/doesn't fit/),
		});
	});

	it("an empty summary", () => {
		expect(
			cutListSummaryText({
				videoClips: 0,
				videoTracks: 0,
				audioClips: 0,
				audioTracks: 0,
				markers: 0,
			}),
		).toBe("Nothing");
	});
});
