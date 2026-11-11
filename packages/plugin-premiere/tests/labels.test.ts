import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipLabels } from "../src/premiere/fcpxml";
import { DEFAULT_LABEL_PREFS, labelColor, parseLabelPrefs } from "../src/premiere/labels";
import { CLIP_PALETTE } from "../src/premiere/palette";

// An excerpt of "Adobe Premiere Pro Prefs", with Violet renamed and recolored and Video's default
// label set to Iris
const prefs = `<?xml version="1.0" encoding="UTF-8"?>
<PremiereData Version="3">
	<Preferences ObjectID="1" ClassID="f06902ec-e637-4744-a586-c26202143e36" Version="30">
		<Properties Version="1">
			<BE.Prefs.LabelNames.0>Client</BE.Prefs.LabelNames.0>
			<BE.Prefs.LabelNames.2>Caribbean</BE.Prefs.LabelNames.2>
			<BE.Prefs.LabelColors.0>255</BE.Prefs.LabelColors.0>
			<BE.Prefs.LabelColors.2>480554</BE.Prefs.LabelColors.2>
			<BE.Prefs.LabelDefaults.Bin>7</BE.Prefs.LabelDefaults.Bin>
			<BE.Prefs.LabelDefaults.Video>1</BE.Prefs.LabelDefaults.Video>
			<BE.Prefs.LabelDefaults.Audio>2</BE.Prefs.LabelDefaults.Audio>
		</Properties>
	</Preferences>
</PremiereData>`;

const fixture = readFileSync(new URL("./fixtures/sequence-labels.xml", import.meta.url), "utf-8");

describe("parseLabelPrefs", () => {
	it("reads label names and colors, colors are 0xBBGGRR", () => {
		const { labels } = parseLabelPrefs(prefs);
		expect(labels[0]).toEqual({ name: "Client", hex: "#ff0000" });
		expect(labels[2]).toEqual({ name: "Caribbean", hex: "#2a5507" });
	});

	it("reads the default label per media type", () => {
		expect(parseLabelPrefs(prefs).defaults).toMatchObject({ Video: 1, Audio: 2 });
	});

	it("keeps the factory settings for what the file doesn't have", () => {
		const { labels, defaults } = parseLabelPrefs(prefs);
		expect(labels[1]).toEqual(CLIP_PALETTE[1]);
		expect(defaults.Still).toBe(DEFAULT_LABEL_PREFS.defaults.Still);
	});

	it("doesn't change the factory settings", () => {
		parseLabelPrefs(prefs);
		expect(DEFAULT_LABEL_PREFS.labels[0]).toEqual(CLIP_PALETTE[0]);
	});

	it("matches Premiere's factory settings for a file with the Standard preset", () => {
		expect(DEFAULT_LABEL_PREFS.defaults).toEqual({
			Video: 0,
			Audio: 2,
			AV: 1,
			Still: 3,
			Sequence: 5,
		});
	});
});

describe("labelColor", () => {
	const custom = parseLabelPrefs(prefs);

	it("takes a clip's own label by name", () => {
		expect(labelColor(custom, { label: "Caribbean", mediaType: "Video" })?.hex).toBe("#2a5507");
	});

	it("finds renamed labels", () => {
		expect(labelColor(custom, { label: "Client", mediaType: "Video" })?.hex).toBe("#ff0000");
	});

	it("is null for an unknown label name", () => {
		expect(labelColor(custom, { label: "Violet", mediaType: "Video" })).toBeNull();
	});

	it("takes the default label of the media type for a clip without one", () => {
		expect(labelColor(custom, { label: null, mediaType: "Video" })?.name).toBe("Iris");
	});

	it("is null without label and media type", () => {
		expect(labelColor(custom, { label: null, mediaType: null })).toBeNull();
	});

	it("colors the fixture's clips like Premiere's timeline", () => {
		const colors = Object.fromEntries(
			[...clipLabels(fixture)].map(([id, clip]) => [
				id,
				labelColor(DEFAULT_LABEL_PREFS, clip)?.name,
			]),
		);
		expect(colors).toEqual({
			"video1.1": "Violet",
			"video1.2": "Violet",
			"video1.3": "Violet",
			"video2.1": "Violet",
			"video2.2": "Violet",
			"video2.3": "Mango",
			"video2.4": "Caribbean",
			"video3.1": "Lavender",
			"video3.2": "Mango",
			"audio1.1": "Magenta",
		});
	});
});
