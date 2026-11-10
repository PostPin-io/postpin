import { describe, expect, it } from "vitest";
import {
	editLinkValues,
	formatExpiry,
	formatLastViewed,
	formatViews,
	newLinkValues,
	orderedLinks,
	partitionLinks,
	remainingTime,
	shareLinkUrl,
	shortUrl,
	toCreateInput,
	toUpdateInput,
} from "#lib/components/sharing/shareLinks.ts";

const now = new Date("2026-11-09T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("shareLinkUrl", () => {
	it("builds the public URL", () =>
		expect(shareLinkUrl("https://app.postpin.io", "abc")).toBe("https://app.postpin.io/s/abc"));
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

describe("formatLastViewed", () => {
	const ago = (ms: number) => new Date(now.getTime() - ms);

	it.each([
		[null, "Not opened yet"],
		[ago(20_000), "Opened just now"],
		[ago(5 * MIN), "Opened 5 minutes ago"],
		[ago(3 * HOUR), "Opened 3 hours ago"],
		[ago(4 * 24 * HOUR), "Opened 4 days ago"],
	])("%s → %s", (date, text) => expect(formatLastViewed(date, now)).toBe(text));
});

describe("formatViews", () => {
	it("pluralizes", () => {
		expect(formatViews(1, 1)).toBe("1 visit · 1 guest");
		expect(formatViews(0, 3)).toBe("0 visits · 3 guests");
	});
});

describe("partitionLinks", () => {
	it("active and expired apart, revoked dropped, order kept", () => {
		const links = [
			{ id: "a", status: "active" as const },
			{ id: "e", status: "expired" as const },
			{ id: "r", status: "revoked" as const },
			{ id: "b", status: "active" as const },
		];
		const { active, expired } = partitionLinks(links);
		expect(active.map((l) => l.id)).toEqual(["a", "b"]);
		expect(expired.map((l) => l.id)).toEqual(["e"]);
	});
});

describe("remainingTime", () => {
	it.each([
		[-1, "expired", true],
		[30 * MIN, "1h", true],
		[5 * HOUR, "5h", true],
		[24 * HOUR, "1d", false],
		[6 * 24 * HOUR + 5 * HOUR, "6d", false],
	])("%i ms → %s", (ms, text, warn) => expect(remainingTime(at(ms), now)).toEqual({ text, warn }));
});

describe("shortUrl", () => {
	it("drops the scheme", () => {
		expect(shortUrl("https://app.postpin.io/s/abc")).toBe("app.postpin.io/s/abc");
		expect(shortUrl("http://localhost:5173/s/abc")).toBe("localhost:5173/s/abc");
	});
});

describe("orderedLinks", () => {
	it("active first, then expired, revoked dropped", () => {
		const links = [
			{ id: "e", status: "expired" as const },
			{ id: "a", status: "active" as const },
			{ id: "r", status: "revoked" as const },
			{ id: "b", status: "active" as const },
		];
		expect(orderedLinks(links).map((l) => l.id)).toEqual(["a", "b", "e"]);
	});
});
