import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearMarkerClipboard,
	readMarkerClipboard,
	writeMarkerClipboard,
} from "#lib/components/review/markers/marker-clipboard.ts";
import { stubLocalStorage } from "../../../../../helpers/local-storage.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

const clip = { sourceExportId: "e1", markerIds: ["m1", "m2"], mode: "copy" as const };

describe("marker clipboard", () => {
	it("round-trips through localStorage", () => {
		stubLocalStorage();
		writeMarkerClipboard(clip);
		expect(readMarkerClipboard()).toEqual(clip);
		clearMarkerClipboard();
		expect(readMarkerClipboard()).toBeNull();
	});

	it("does not overwrite the clipboard with an empty selection", () => {
		stubLocalStorage();
		writeMarkerClipboard(clip);
		writeMarkerClipboard({ ...clip, markerIds: [] });
		expect(readMarkerClipboard()).toEqual(clip);
	});

	it("null when nothing is stored", () => {
		stubLocalStorage();
		expect(readMarkerClipboard()).toBeNull();
	});

	it.each([
		["broken JSON", "{"],
		["array", "[]"],
		["missing mode", JSON.stringify({ sourceExportId: "e", markerIds: [] })],
		["unknown mode", JSON.stringify({ ...clip, mode: "move" })],
		["non-string id", JSON.stringify({ ...clip, markerIds: ["a", 1] })],
		["markerIds not an array", JSON.stringify({ ...clip, markerIds: "m1" })],
		["sourceExportId not a string", JSON.stringify({ ...clip, sourceExportId: 5 })],
	])("rejects %s", (_, raw) => {
		const data = stubLocalStorage();
		data.set("MarkerClipboard", raw);
		expect(readMarkerClipboard()).toBeNull();
	});

	it("never throws when storage is blocked", () => {
		stubLocalStorage({ blocked: true });
		expect(() => writeMarkerClipboard(clip)).not.toThrow();
		expect(readMarkerClipboard()).toBeNull();
		expect(() => clearMarkerClipboard()).not.toThrow();
	});
});
