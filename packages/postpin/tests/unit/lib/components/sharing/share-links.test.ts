import { describe, expect, it } from "vitest";
import {
	clipboardText,
	editLinkValues,
	formatExpiry,
	newLinkValues,
	shareLinkUrl,
	toCreateInput,
	toUpdateInput,
} from "#lib/components/sharing/shareLinks.ts";

const now = new Date("2026-11-09T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("shareLinkUrl / clipboardText", () => {
	const url = shareLinkUrl("https://app.postpin.io", "abc");

	it("builds the public URL", () => expect(url).toBe("https://app.postpin.io/s/abc"));

	it("is just the URL without a note", () => {
		expect(clipboardText(url, null)).toBe(url);
		expect(clipboardText(url, "   ")).toBe(url);
	});

	it("puts the trimmed note before the URL", () =>
		expect(clipboardText(url, "  Please review cut 3  ")).toBe(`Please review cut 3\n\n${url}`));
});

describe("formatExpiry", () => {
	it.each([
		[-1, "Expired"],
		[0, "Expired"],
		[30 * MIN, "Expires in 30 minutes"],
		[24 * HOUR, "Expires in 24 hours"],
		[7 * 24 * HOUR, "Expires in 7 days"],
	])("%i ms → %s", (ms, text) => expect(formatExpiry(at(ms), now)).toBe(text));
});

describe("form values", () => {
	it("new links: markers on, timeline off, 7 days", () =>
		expect(newLinkValues()).toEqual({
			timelinePanelVisible: false,
			markerPanelVisible: true,
			note: "",
			preset: "7d",
		}));

	it("editing keeps the expiry unless a preset is picked", () => {
		const values = editLinkValues({
			timelinePanelVisible: true,
			markerPanelVisible: false,
			note: null,
		});
		expect(values).toMatchObject({ note: "", preset: null });
		expect(toUpdateInput("l1", values)).not.toHaveProperty("preset");
		expect(toUpdateInput("l1", { ...values, preset: "24h" })).toMatchObject({ preset: "24h" });
	});

	it("create always sends a preset", () =>
		expect(toCreateInput("e1", { ...newLinkValues(), preset: null })).toMatchObject({
			exportId: "e1",
			preset: "7d",
		}));
});
