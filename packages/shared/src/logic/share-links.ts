import * as v from "valibot";

const HOUR = 60 * 60 * 1000;

/** How long a new link stays active. No "never": every link expires. */
export const SHARE_LINK_PRESETS = {
	"24h": 24 * HOUR,
	"7d": 7 * 24 * HOUR,
	"30d": 30 * 24 * HOUR,
} as const;

export type ShareLinkPreset = keyof typeof SHARE_LINK_PRESETS;
export const SHARE_LINK_PRESET_IDS = Object.keys(SHARE_LINK_PRESETS) as ShareLinkPreset[];
export const DEFAULT_SHARE_LINK_PRESET: ShareLinkPreset = "7d";

export const NOTE_MAX_LENGTH = 2000;

export function expiresAtFor(preset: ShareLinkPreset, now = new Date()): Date {
	return new Date(now.getTime() + SHARE_LINK_PRESETS[preset]);
}

export type ShareLinkStatus = "active" | "expired" | "revoked";

export function shareLinkStatus(
	link: { expiresAt: Date; revokedAt: Date | null },
	now = new Date(),
): ShareLinkStatus {
	if (link.revokedAt) return "revoked";
	return link.expiresAt <= now ? "expired" : "active";
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

/** Guests: never past the link's expiry. At least 1 s (S3 rejects 0). */
export function shareUrlLifetime(expiresAt: Date, now = new Date()) {
	const left = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
	return Math.max(1, Math.min(MAX_URL_LIFETIME_SECONDS, left));
}

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

const mailDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

/** Subject and plain text of the mail; the note comes first, as the sender wrote it */
export function shareLinkMailContent(mail: {
	senderName: string;
	exportName: string;
	url: string;
	note: string | null;
	expiresAt: Date;
}) {
	const lines = [
		`${mail.senderName} shared the video "${mail.exportName}" with you on PostPin.`,
		...(mail.note ? ["", mail.note] : []),
		"",
		`Watch it and leave your markers: ${mail.url}`,
		`The link works until ${mailDate.format(mail.expiresAt)}.`,
	];
	return {
		subject: `${mail.senderName} shared "${mail.exportName}" with you`,
		text: lines.join("\n"),
	};
}
