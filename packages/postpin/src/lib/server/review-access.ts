import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { shareUrlLifetime } from "@postpin-io/shared/logic/share-links";
import { authorize, requireMediaAccess } from "#lib/server/org-access.ts";
import { requireShareGuest } from "#lib/server/share-guests.ts";

/**
 * Who reads an export or its media. A share token in the call means "as guest", even when
 * someone is signed in: the share page shows exactly what the client sees. Without a token
 * it is the usual member check.
 */
export type Reader =
	| ({ kind: "member" } & Awaited<ReturnType<typeof requireMediaAccess>>)
	| ({ kind: "guest" } & Awaited<ReturnType<typeof requireShareGuest>>);

export async function readExport(exportId: string, shareToken?: string): Promise<Reader> {
	if (!shareToken) {
		return {
			kind: "member",
			...(await authorize("export", "read", { type: "export", id: exportId })),
		};
	}
	const session = await requireShareGuest(shareToken, getRequestEvent().cookies);
	// a valid token for another export reveals nothing about this one
	if (session.link.export.id !== exportId) error(404, "Not found");
	return { kind: "guest", ...session };
}

export async function readMedia(mediaId: string, shareToken?: string): Promise<Reader> {
	if (!shareToken) return { kind: "member", ...(await requireMediaAccess(mediaId)) };
	const session = await requireShareGuest(shareToken, getRequestEvent().cookies);
	if (session.link.export.mediaId !== mediaId) error(404, "Not found");
	return { kind: "guest", ...session };
}

/** Presigned URLs for guests never outlive the link; members get each helper's default */
export const urlLifetime = (reader: Reader) =>
	reader.kind === "guest" ? shareUrlLifetime(reader.link.expiresAt) : undefined;

/** Joined through a screening link (see ShareLinkKind) */
export const isScreeningGuest = (reader: Reader) =>
	reader.kind === "guest" && reader.link.kind === "SCREENING";

/** Clips, shot thumbnails and the barcode belong to the timeline panel */
export function requireTimeline(reader: Reader) {
	if (reader.kind === "guest" && !reader.link.timelinePanelVisible) {
		error(403, "The timeline isn't shared");
	}
}
/** Guests only work with markers when the link shows the marker panel */
export function requireMarkers(reader: Reader) {
	if (reader.kind === "guest" && !reader.link.markerPanelVisible) {
		error(403, "Markers are turned off for this link");
	}
	// Joined while markers were off, so no name yet: the share page asks for it first
	if (reader.kind === "guest" && !reader.guest.name) error(401, "Enter your name first");
}
