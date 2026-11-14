import { createHash, randomBytes } from "node:crypto";
import { error, type Cookies } from "@sveltejs/kit";
import { prisma } from "#lib/server/database.ts";
import { resolveShareLink } from "#lib/server/share-links.ts";

/** Long-lived: whether the link is still valid is checked on every request, not by the cookie */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
/** Each name submission creates a guest; this keeps a leaked link from filling the table */
export const MAX_GUESTS_PER_LINK = 500;

/** Screening links carry their own, lower limit */
export const guestLimit = (link: { maxGuests: number | null }) =>
	Math.min(link.maxGuests ?? MAX_GUESTS_PER_LINK, MAX_GUESTS_PER_LINK);

/** No room for another guest. Guests who joined before keep their access. */
export async function isShareLinkFull(link: { id: string; maxGuests: number | null }) {
	const count = await prisma.shareGuest.count({ where: { shareLinkId: link.id } });
	return count >= guestLimit(link);
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** One cookie per link; path "/" so it reaches /_app/remote/ and /media/ too */
export const shareGuestCookieName = (linkId: string) => `postpin_share_${linkId}`;

function setCookie(cookies: Cookies, linkId: string, value: string) {
	cookies.set(shareGuestCookieName(linkId), value, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		maxAge: COOKIE_MAX_AGE,
		// secure: SvelteKit's default (true, except on http://localhost)
	});
}

/** New guest for this browser. Only the hash of the cookie value is stored. */
export async function createShareGuest(
	cookies: Cookies,
	link: { id: string; token: string; maxGuests: number | null },
	name: string | null,
) {
	// Two guests joining at the same moment can both pass; one over the limit is fine
	if (await isShareLinkFull(link)) error(429, "This link has too many visitors");

	const session = randomBytes(32).toString("base64url");
	const guest = await prisma.shareGuest.create({
		data: { shareLinkId: link.id, name, sessionTokenHash: hash(session) },
	});
	setCookie(cookies, link.id, session);
	return guest;
}

/**
 * This browser's guest on this link, or null. Does not check the link itself:
 * callers resolve it first (resolveShareLink / requireShareGuest).
 */
export async function findShareGuest(cookies: Cookies, link: { id: string }) {
	const value = cookies.get(shareGuestCookieName(link.id));
	if (!value) return null;
	return prisma.shareGuest.findFirst({
		where: { sessionTokenHash: hash(value), shareLinkId: link.id },
	});
}

/**
 * For every guest request: valid link + this browser's guest.
 * 404 unknown link, 410 expired/revoked (ends running sessions at once), 401 no guest yet.
 */
export async function requireShareGuest(token: string, cookies: Cookies) {
	const link = await resolveShareLink(token);
	const guest = await findShareGuest(cookies, link);
	if (!guest) error(401, "Enter your name first");
	return { link, guest };
}
