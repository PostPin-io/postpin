import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	GUEST_NAME_MAX_LENGTH,
	MAX_RECIPIENTS_PER_SEND,
	NOTE_MAX_LENGTH,
	expiresAtFor,
	parseEmailList,
	screeningCategoryName,
	screeningDate,
	screeningExpiresSoon,
	shareGuestName,
	shareLinkMailContent,
	shareLinkNote,
	shareLinkRecipients,
	shareLinkStatus,
	shareUrlLifetime,
	timeZone,
} from "../../src/logic/share-links.ts";

const now = new Date("2026-11-09T12:00:00Z");

describe("expiresAtFor", () => {
	it.each([
		["24h", "2026-11-10T12:00:00.000Z"],
		["7d", "2026-11-16T12:00:00.000Z"],
		["30d", "2026-12-09T12:00:00.000Z"],
	] as const)("%s", (preset, expected) => {
		expect(expiresAtFor(preset, now).toISOString()).toBe(expected);
	});
});

describe("shareLinkStatus", () => {
	const later = new Date(now.getTime() + 1000);
	const earlier = new Date(now.getTime() - 1000);

	it("active before expiry", () =>
		expect(shareLinkStatus({ expiresAt: later, revokedAt: null }, now)).toBe("active"));
	it("expired at and after expiry", () => {
		expect(shareLinkStatus({ expiresAt: now, revokedAt: null }, now)).toBe("expired");
		expect(shareLinkStatus({ expiresAt: earlier, revokedAt: null }, now)).toBe("expired");
	});
	it("revoked wins over expiry", () =>
		expect(shareLinkStatus({ expiresAt: later, revokedAt: earlier }, now)).toBe("revoked"));
});

describe("shareLinkNote", () => {
	it("trims", () => expect(v.parse(shareLinkNote, "  hi  ")).toBe("hi"));
	it("blank becomes null", () => expect(v.parse(shareLinkNote, "   ")).toBeNull());
	it("accepts the max length", () =>
		expect(v.parse(shareLinkNote, "x".repeat(NOTE_MAX_LENGTH))).toHaveLength(NOTE_MAX_LENGTH));
	it("rejects longer notes", () =>
		expect(() => v.parse(shareLinkNote, "x".repeat(NOTE_MAX_LENGTH + 1))).toThrow());
});
describe("shareGuestName", () => {
	it("trims", () => expect(v.parse(shareGuestName, "  Anna  ")).toBe("Anna"));
	it.each(["", "   ", "x".repeat(GUEST_NAME_MAX_LENGTH + 1)])("rejects %j", (name) =>
		expect(() => v.parse(shareGuestName, name)).toThrow(),
	);
});

describe("shareUrlLifetime", () => {
	it.each([
		["7 days left → 12 h", 7 * 24 * 3600, 12 * 3600],
		["2 h left → 2 h", 2 * 3600, 2 * 3600],
		["already past → 1 s", -10, 1],
	])("%s", (_, secondsLeft, expected) =>
		expect(shareUrlLifetime(new Date(now.getTime() + secondsLeft * 1000), now)).toBe(expected),
	);
});

describe("parseEmailList", () => {
	it("splits on commas, semicolons, spaces and line breaks", () => {
		expect(parseEmailList("a@x.io, b@x.io;c@x.io\nd@x.io e@x.io").valid).toEqual([
			"a@x.io",
			"b@x.io",
			"c@x.io",
			"d@x.io",
			"e@x.io",
		]);
	});

	it('takes the address out of "Name <address>"', () => {
		expect(parseEmailList("Anna Muster <Anna@X.io>, ben@x.io").valid).toEqual([
			"anna@x.io",
			"ben@x.io",
		]);
	});

	it("drops duplicates regardless of case and reports invalid entries", () => {
		expect(parseEmailList("a@x.io A@X.IO nope b@")).toEqual({
			valid: ["a@x.io"],
			invalid: ["nope", "b@"],
		});
	});

	it("is empty for blank text", () => {
		expect(parseEmailList("  \n , ")).toEqual({ valid: [], invalid: [] });
	});
});

describe("shareLinkRecipients", () => {
	it("trims, lower-cases and dedupes", () => {
		expect(v.parse(shareLinkRecipients, [" A@x.io ", "a@x.io", "b@x.io"])).toEqual([
			"a@x.io",
			"b@x.io",
		]);
	});

	it.each([
		["no address", []],
		["an invalid one", ["a@x.io", "nope"]],
		["too many", Array.from({ length: MAX_RECIPIENTS_PER_SEND + 1 }, (_, i) => `u${i}@x.io`)],
	])("rejects %s", (_, list) => {
		expect(() => v.parse(shareLinkRecipients, list)).toThrow();
	});
});

describe("shareLinkMailContent", () => {
	const base = {
		senderName: "Hannes",
		exportName: "Cut 3",
		url: "https://app.postpin.io/s/abc",
		expiresAt: new Date("2026-11-16T12:00:00Z"),
	};

	it("names sender and export, ends with link and expiry", () => {
		const mail = shareLinkMailContent({ ...base, note: null });
		expect(mail.subject).toBe('Hannes shared "Cut 3" with you');
		expect(mail.text).toContain("https://app.postpin.io/s/abc");
		expect(mail.text).toContain("November 16, 2026");
		expect(mail.text.split("\n")[1]).toBe("");
	});

	it("puts the note right after the first line", () => {
		const lines = shareLinkMailContent({ ...base, note: "Please check the ending" }).text.split(
			"\n",
		);
		expect(lines[2]).toBe("Please check the ending");
	});
});

describe("screeningDate", () => {
	it("is the day where the presenter is, as DD/MM/YYYY", () => {
		const lateEvening = new Date("2026-11-14T23:30:00Z");
		expect(screeningDate(lateEvening, "UTC")).toBe("14/11/2026");
		expect(screeningDate(lateEvening, "Europe/Berlin")).toBe("15/11/2026");
		expect(screeningDate(lateEvening, "America/Los_Angeles")).toBe("14/11/2026");
	});

	it("pads day and month", () => {
		expect(screeningDate(new Date("2027-03-05T12:00:00Z"), "UTC")).toBe("05/03/2027");
	});
});

describe("screeningCategoryName", () => {
	const day = "14/11/2026";

	it("the first screening of a day has no number", () => {
		expect(screeningCategoryName(day, [])).toBe("Screening (14/11/2026)");
		expect(screeningCategoryName(day, ["Guest", "Screening (13/11/2026)"])).toBe(
			"Screening (14/11/2026)",
		);
	});

	it("more on the same day are numbered from 2", () => {
		expect(screeningCategoryName(day, ["Screening (14/11/2026)"])).toBe("Screening 2 (14/11/2026)");
		expect(screeningCategoryName(day, ["Screening (14/11/2026)", "Screening 2 (14/11/2026)"])).toBe(
			"Screening 3 (14/11/2026)",
		);
	});

	it("counts on from the highest number: a deleted one isn't handed out again", () => {
		expect(screeningCategoryName(day, ["Screening 4 (14/11/2026)"])).toBe(
			"Screening 5 (14/11/2026)",
		);
	});

	it("ignores other days and names that only look similar", () => {
		expect(
			screeningCategoryName(day, [
				"Screening 7 (13/11/2026)",
				"Screening notes (14/11/2026)",
				"Pre-Screening (14/11/2026)",
				"Screening (14/11/2026) old",
			]),
		).toBe("Screening (14/11/2026)");
	});
});

describe("timeZone", () => {
	it.each(["Europe/Berlin", "UTC", "America/New_York"])("accepts %s", (zone) => {
		expect(v.parse(timeZone, zone)).toBe(zone);
	});

	it.each(["", "Mars/Olympus", "x".repeat(65)])("rejects %j", (zone) => {
		expect(() => v.parse(timeZone, zone)).toThrow();
	});
});

describe("screeningExpiresSoon", () => {
	it("from less than an hour before the expiry", () => {
		expect(screeningExpiresSoon(new Date(now.getTime() + 61 * 60_000), now)).toBe(false);
		expect(screeningExpiresSoon(new Date(now.getTime() + 59 * 60_000), now)).toBe(true);
		expect(screeningExpiresSoon(new Date(now.getTime() - 1000), now)).toBe(true);
	});
});
