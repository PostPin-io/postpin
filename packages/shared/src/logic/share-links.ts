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
