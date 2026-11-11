import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipLabels } from "../src/premiere/fcpxml";

// Exported from Premiere with Datei → Exportieren → Final Cut Pro XML. The sequence has:
// V1: 3 clips, the second one disabled
// V2: 4 clips, a cross dissolve between the 2nd and 3rd, the last two labeled Mango and Caribbean
// V3: a graphic (own project item, no label) and a clip labeled Mango
// V4: empty
// A1: one stereo clip labeled Magenta. Premiere writes stereo tracks as one or two <track>
//     elements (currentExplodedTrackIndex 0 and 1), so the 3 audio tracks are 5 in the XML.
// The sequence itself is labeled Forest. Clips without <labels> have the default label of their
// media type: the video clips Violet, the graphic Lavender.
const fixture = readFileSync(new URL("./fixtures/sequence-labels.xml", import.meta.url), "utf-8");

const xmeml = (tracks: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
	<sequence id="sequence-1">
		<name>Test</name>
		<media>${tracks}</media>
		<labels><label2>Forest</label2></labels>
	</sequence>
</xmeml>`;

const clipitem = (name: string, label?: string, inner = "") => `
	<clipitem id="${name}">
		<name>${name}</name>
		<enabled>TRUE</enabled>
		${inner}
		${label ? `<labels><label2>${label}</label2></labels>` : ""}
	</clipitem>`;

const file = (id: string, media: string, duration = "<duration>100</duration>") =>
	`<file id="${id}"><name>${id}</name>${duration}<media>${media}</media></file>`;

describe("clipLabels", () => {
	it("keys every clip by its snapshot id, with the clip name, label and media type", () => {
		const video = (label: string | null) => ({
			name: "export-21x9.mp4",
			label,
			mediaType: "Video",
		});
		expect(clipLabels(fixture)).toEqual(
			new Map([
				["video1.1", video(null)],
				["video1.2", video(null)],
				["video1.3", video(null)],
				["video2.1", video(null)],
				["video2.2", video(null)],
				["video2.3", video("Mango")],
				["video2.4", video("Caribbean")],
				["video3.1", { name: "Grafik", label: null, mediaType: "Still" }],
				["video3.2", video("Mango")],
				["audio1.1", { name: "2 One Love.mp3", label: "Magenta", mediaType: "Audio" }],
			]),
		);
	});

	it("tells video with audio from video only", () => {
		const labels = clipLabels(
			xmeml(`<video><track>
				${clipitem("av", undefined, file("file-1", "<video/><audio/>"))}
				${clipitem("v", undefined, file("file-2", "<video/>"))}
			</track></video>`),
		);
		expect(labels.get("video1.1")?.mediaType).toBe("AV");
		expect(labels.get("video1.2")?.mediaType).toBe("Video");
	});

	it("finds a file described at a clip on another track", () => {
		const labels = clipLabels(
			xmeml(`
			<video><track>${clipitem("ref", undefined, `<file id="file-1"/>`)}</track></video>
			<audio><track>${clipitem("def", undefined, file("file-1", "<video/><audio/>"))}</track></audio>`),
		);
		expect(labels.get("video1.1")?.mediaType).toBe("AV");
	});

	it("takes a file without duration for a still", () => {
		const labels = clipLabels(
			xmeml(
				`<video><track>${clipitem("s", undefined, file("file-1", "<video/>", ""))}</track></video>`,
			),
		);
		expect(labels.get("video1.1")?.mediaType).toBe("Still");
	});

	it("takes a clip with a <sequence> for a nested sequence", () => {
		const labels = clipLabels(
			xmeml(
				`<video><track>${clipitem("n", undefined, `<sequence id="sequence-2"/>`)}</track></video>`,
			),
		);
		expect(labels.get("video1.1")?.mediaType).toBe("Sequence");
	});

	it("counts disabled clips, like the snapshot's numbering does", () => {
		expect(clipLabels(fixture).get("video1.3")).toBeDefined();
	});

	it("skips transitions", () => {
		expect(clipLabels(fixture).get("video2.3")?.label).toBe("Mango");
	});

	it("counts a stereo track split into two <track> elements once", () => {
		const labels = clipLabels(
			xmeml(`
			<video></video>
			<audio>
				<track currentExplodedTrackIndex="0" totalExplodedTrackCount="2">${clipitem("a", "Rose")}</track>
				<track currentExplodedTrackIndex="1" totalExplodedTrackCount="2">${clipitem("a", "Rose")}</track>
				<track currentExplodedTrackIndex="0" totalExplodedTrackCount="1">${clipitem("b", "Teal")}</track>
			</audio>`),
		);
		expect(labels).toEqual(
			new Map([
				["audio1.1", { name: "a", label: "Rose", mediaType: null }],
				["audio2.1", { name: "b", label: "Teal", mediaType: null }],
			]),
		);
	});

	it("reads a track with a single clip", () => {
		const labels = clipLabels(xmeml(`<video><track>${clipitem("only", "Iris")}</track></video>`));
		expect(labels).toEqual(
			new Map([["video1.1", { name: "only", label: "Iris", mediaType: null }]]),
		);
	});

	it("doesn't take the sequence's label for its clips", () => {
		const labels = clipLabels(xmeml(`<video><track>${clipitem("plain")}</track></video>`));
		expect(labels.get("video1.1")?.label).toBeNull();
	});

	it("is empty for a sequence without tracks", () => {
		expect(clipLabels(xmeml(`<video></video><audio></audio>`)).size).toBe(0);
	});
});
