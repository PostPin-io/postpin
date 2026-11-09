import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	GUEST_NAME_MAX_LENGTH,
	NOTE_MAX_LENGTH,
	expiresAtFor,
	shareGuestName,
	shareLinkNote,
	shareLinkStatus,
	shareUrlLifetime,
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
