import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CutListError, type CutList } from "../../src/logic/cut-list.ts";
import { fcpxmlToCutList, isFcpxml } from "../../src/logic/fcpxml.ts";

const fixture = readFileSync(new URL("./fixtures/timeline.fcpxml", import.meta.url), "utf8");
const tracksOf = (list: CutList) =>
	list.tracks.map((t) => [t.type, t.name, t.events.map((e) => `${e.name} ${e.in}-${e.out}`)]);

describe("fcpxmlToCutList", () => {
	it("every lane is a track: pictures from the bottom up, then the sound", () => {
		const list = fcpxmlToCutList(fixture);
		expect(list).toMatchObject({
			format: "fcpxml",
			title: "Trailer",
			frameRate: { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false },
		});
		expect(tracksOf(list)).toEqual([
			// the primary storyline; its gaps and the transition are no clips
			[
				"video",
				"Video 1",
				[
					"A001.mov 01:00:02:00-01:00:06:00",
					"B002.mov 01:00:06:00-01:00:09:00",
					"Credits 01:00:09:00-01:00:10:00",
				],
			],
			// connected clips: over a gap, B-roll over A001, a still on the last gap
			[
				"video",
				"Video 2",
				[
					"Compound Clip 1 01:00:00:00-01:00:02:00",
					"B002.mov 01:00:02:00-01:00:03:00",
					"Photo.jpg 01:00:10:00-01:00:11:00",
				],
			],
			// the primary storyline's sound
			[
				"audio",
				"Audio 1",
				["A001.mov 01:00:02:00-01:00:06:00", "B002.mov 01:00:06:00-01:00:09:00"],
			],
			// below it: the effects
			["audio", "Audio 2", ["Birds.wav 01:00:02:00-01:00:06:00"]],
			// above it: the B-roll's sound, the audio part of A001 on the gap, the song with its cover
			[
				"audio",
				"Audio 3",
				["B002.mov 01:00:02:00-01:00:03:00", "A001.mov 01:00:11:00-01:00:12:00"],
			],
			["audio", "Audio 4", ["Song & Cover.mp4 01:00:02:00-01:00:12:00"]],
		]);
	});

	it("the source timecode of each clip", () => {
		const [v1] = fcpxmlToCutList(fixture).tracks;
		expect(v1!.events.map((e) => e.sourceIn)).toEqual([
			"00:00:10:00",
			"00:00:30:00",
			"00:00:00:00",
		]);
	});

	it("29.97 drop-frame, with times in 1001/30000 s", () => {
		const xml = `<fcpxml version="1.10"><resources>
			<format id="r0" frameDuration="1001/30000s" name="FFVideoFormat1080p2997"/>
			<asset id="r1" name="A.mov" hasVideo="1" format="r0" start="0s" duration="100s"/>
		</resources><library><event><project name="DF">
			<sequence format="r0" tcFormat="DF" tcStart="3600s" duration="20s"><spine>
				<asset-clip ref="r1" name="A.mov" offset="3600s" start="0s" duration="300300/30000s"/>
			</spine></sequence>
		</project></event></library></fcpxml>`;
		const list = fcpxmlToCutList(xml);
		expect(list.frameRate).toEqual({ fpsNumerator: 30000, fpsDenominator: 1001, dropFrame: true });
		// 10.01 s are 300 frames at 29.97
		expect(list.tracks[0]!.events[0]).toMatchObject({ in: "01:00:00;00", out: "01:00:10;00" });
	});

	it("a secondary storyline counts from its own start", () => {
		const xml = `<fcpxml version="1.10"><resources>
			<format id="r0" frameDuration="1/25s"/>
			<asset id="r1" name="A.mov" hasVideo="1" format="r0"/>
			<asset id="r2" name="B.mov" hasVideo="1" format="r0"/>
		</resources><library><event><project name="P">
			<sequence format="r0" tcStart="0s" duration="10s"><spine>
				<asset-clip ref="r1" name="A.mov" offset="0s" start="100s" duration="10s">
					<spine lane="1" offset="102s">
						<asset-clip ref="r2" name="B.mov" offset="0s" start="0s" duration="1s"/>
						<asset-clip ref="r2" name="B.mov" offset="1s" start="5s" duration="1s"/>
					</spine>
				</asset-clip>
			</spine></sequence>
		</project></event></library></fcpxml>`;
		expect(tracksOf(fcpxmlToCutList(xml))).toEqual([
			["video", "Video 1", ["A.mov 00:00:00:00-00:00:10:00"]],
			["video", "Video 2", ["B.mov 00:00:02:00-00:00:03:00", "B.mov 00:00:03:00-00:00:04:00"]],
		]);
	});

	it.each([
		["no XML", "TITLE: x", /Not an FCPXML/],
		["another XML", "<?xml version='1.0'?><plist/>", /Not an FCPXML/],
		["no project", "<fcpxml><resources/></fcpxml>", /no project timeline/],
		[
			"no video",
			`<fcpxml><resources><format id="r0" frameDuration="1/25s"/><asset id="r1" hasAudio="1"/></resources>
			<library><project name="P"><sequence format="r0"><spine>
			<asset-clip ref="r1" offset="0s" duration="1s"/></spine></sequence></project></library></fcpxml>`,
			/no video clips and no markers/,
		],
	])("rejects %s", (_, xml, message) => {
		expect(() => fcpxmlToCutList(xml)).toThrow(CutListError);
		expect(() => fcpxmlToCutList(xml)).toThrow(message);
	});
});

describe("fcpxmlToCutList: markers", () => {
	const xml = (markers: string) => `<fcpxml version="1.11"><resources>
		<format id="r0" frameDuration="1/25s"/>
		<asset id="r1" name="A.mov" hasVideo="1" format="r0"/>
	</resources><library><event><project name="P">
		<sequence format="r0" tcStart="3600s" duration="20s"><spine>
			<gap name="Gap" offset="3600s" start="3600s" duration="2s">
				<marker start="3601s" duration="1/25s" value="On the gap"/>
			</gap>
			<asset-clip ref="r1" name="A.mov" offset="3602s" start="100s" duration="10s">
				${markers}
			</asset-clip>
		</spine></sequence>
	</project></event></library></fcpxml>`;

	it("at their place on the timeline, from the clip's source time, with their type", () => {
		const list = fcpxmlToCutList(
			xml(`<marker start="101s" duration="1/25s" value="Fix the grade" note="too warm"/>
				<marker start="102s" duration="2s" value="Check" completed="0"/>
				<marker start="103s" duration="1/25s" value="Checked" completed="1"/>
				<chapter-marker start="104s" duration="1/25s" value="Act 2" posterOffset="0s"/>
				<marker start="105s" duration="1/25s" value=""/>`),
		);
		expect(list.markers).toEqual([
			{
				name: "On the gap",
				note: null,
				at: "01:00:01:00",
				duration: 0,
				host: "Final Cut",
				label: "Marker",
			},
			{
				name: "Fix the grade",
				note: "too warm",
				at: "01:00:03:00",
				duration: 0,
				host: "Final Cut",
				label: "Marker",
			},
			{
				name: "Check",
				note: null,
				at: "01:00:04:00",
				duration: 50,
				host: "Final Cut",
				label: "To-do",
			},
			{
				name: "Checked",
				note: null,
				at: "01:00:05:00",
				duration: 0,
				host: "Final Cut",
				label: "Done",
			},
			{
				name: "Act 2",
				note: null,
				at: "01:00:06:00",
				duration: 0,
				host: "Final Cut",
				label: "Chapter",
			},
			{
				name: "Marker",
				note: null,
				at: "01:00:07:00",
				duration: 0,
				host: "Final Cut",
				label: "Marker",
			},
		]);
	});

	it("a timeline without markers has none", () => {
		expect(fcpxmlToCutList(fixture).markers).toEqual([]);
	});
});

describe("isFcpxml", () => {
	it.each([
		["<?xml version='1.0'?><fcpxml/>", true],
		["﻿  <fcpxml/>", true],
		["TITLE: x", false],
	])("%s: %s", (text, expected) => {
		expect(isFcpxml(text)).toBe(expected);
	});
});
