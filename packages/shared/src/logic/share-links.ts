import * as v from "valibot";

const HOUR = 60 * 60 * 1000;

/** How long a new link stays active; "never" (null) lasts until it is revoked */
export const SHARE_LINK_PRESETS = {
	"24h": 24 * HOUR,
	"7d": 7 * 24 * HOUR,
	"30d": 30 * 24 * HOUR,
	never: null,
} as const;

export type ShareLinkPreset = keyof typeof SHARE_LINK_PRESETS;
export const SHARE_LINK_PRESET_IDS = Object.keys(SHARE_LINK_PRESETS) as ShareLinkPreset[];
export const DEFAULT_SHARE_LINK_PRESET: ShareLinkPreset = "7d";

export const NOTE_MAX_LENGTH = 2000;

/** null for "never" */
export function expiresAtFor(preset: ShareLinkPreset, now = new Date()): Date | null {
	const ms = SHARE_LINK_PRESETS[preset];
	return ms === null ? null : new Date(now.getTime() + ms);
}

export type ShareLinkStatus = "active" | "expired" | "revoked";

export function shareLinkStatus(
	link: { expiresAt: Date | null; revokedAt: Date | null },
	now = new Date(),
): ShareLinkStatus {
	if (link.revokedAt) return "revoked";
	return link.expiresAt && link.expiresAt <= now ? "expired" : "active";
}

/** Path of the public share view; the UI puts the origin in front */
export const shareLinkPath = (token: string) => `/s/${token}`;

// ─── Validation ─────────────────────────────────────────────────────────────

export const shareLinkPreset = v.picklist(SHARE_LINK_PRESET_IDS);

/** Plain text, trimmed; empty means "no note" (null) */
export const shareLinkNote = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(NOTE_MAX_LENGTH),
	v.transform((s) => s || null),
);
export const GUEST_NAME_MAX_LENGTH = 80;

export const shareGuestName = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1),
	v.maxLength(GUEST_NAME_MAX_LENGTH),
);
/** Lifetime of presigned URLs everywhere: team and guests */
export const MAX_URL_LIFETIME_SECONDS = 12 * 60 * 60;

/** Guests: never past the link's expiry (if it has one). At least 1 s (S3 rejects 0). */
export function shareUrlLifetime(expiresAt: Date | null, now = new Date()) {
	if (!expiresAt) return MAX_URL_LIFETIME_SECONDS;
	const left = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
	return Math.max(1, Math.min(MAX_URL_LIFETIME_SECONDS, left));
}

// ─── Screenings ─────────────────────────────────────────────────────────────

/** A screening link is made for one evening */
export const SCREENING_PRESET = "24h" satisfies ShareLinkPreset;
/** Preselected guest limit; the server's SCREENING_MAX_GUESTS caps it */
export const SCREENING_DEFAULT_MAX_GUESTS = 30;

/** An IANA time zone the runtime knows, e.g. "Europe/Berlin" */
export const timeZone = v.pipe(
	v.string(),
	v.maxLength(64),
	v.check((zone) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: zone });
			return true;
		} catch {
			return false;
		}
	}, "Unknown time zone"),
);

/** The day of a screening as its category shows it: DD/MM/YYYY, where the presenter is */
export function screeningDate(now: Date, zone: string) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: zone,
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).formatToParts(now);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return `${part("day")}/${part("month")}/${part("year")}`;
}

/**
 * Name of the category for a new screening: "Screening (14/11/2026)", then
 * "Screening 2 (14/11/2026)" and so on for more screenings on that day. `existing`: the
 * project's category names. Counts on from the highest number, so a deleted one isn't reused.
 */
export function screeningCategoryName(date: string, existing: string[]) {
	let highest = 0;
	for (const name of existing) {
		const match = /^Screening(?: (\d+))? \((.+)\)$/.exec(name);
		if (match && match[2] === date) highest = Math.max(highest, Number(match[1] ?? 1));
	}
	return highest === 0 ? `Screening (${date})` : `Screening ${highest + 1} (${date})`;
}

/** Less than an hour left: the presenter is warned, guests could be locked out mid-screening */
export const screeningExpiresSoon = (expiresAt: Date | null, now = new Date()) =>
	!!expiresAt && expiresAt.getTime() - now.getTime() < HOUR;

// ─── Sending by e-mail ──────────────────────────────────────────────────────

export const MAX_RECIPIENTS_PER_SEND = 20;
/** Per sender and link, rolling 24 h */
export const MAX_RECIPIENTS_PER_DAY = 50;

const emailAddress = v.pipe(v.string(), v.email());

/** Server side: the list the client sends, trimmed, lower-cased, without duplicates */
export const shareLinkRecipients = v.pipe(
	v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email())),
	v.minLength(1, "Enter at least one e-mail address"),
	v.maxLength(MAX_RECIPIENTS_PER_SEND, `At most ${MAX_RECIPIENTS_PER_SEND} recipients at once`),
	v.transform((list) => [...new Set(list)]),
);

/**
 * Client side: free text → addresses. Separated by commas, semicolons, line breaks or spaces;
 * "Anna Muster <anna@example.com>" works too. Duplicates are dropped, case is ignored.
 */
export function parseEmailList(text: string) {
	const entries = text.split(/[,;\n]+/).flatMap((entry) => {
		const bracketed = entry.match(/<([^>]+)>/);
		return bracketed ? [bracketed[1]!] : entry.split(/\s+/);
	});
	const valid: string[] = [];
	const invalid: string[] = [];
	for (const raw of entries) {
		const address = raw.trim().toLowerCase();
		if (!address) continue;
		const list = v.is(emailAddress, address) ? valid : invalid;
		if (!list.includes(address)) list.push(address);
	}
	return { valid, invalid };
}
