import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { shareGuestName } from "@postpin-io/shared/logic/share-links";
import { prisma } from "#lib/server/database.ts";
import {
	createShareGuest,
	findShareGuest,
	isShareLinkFull,
	requireShareGuest,
} from "#lib/server/share-guests.ts";
import { error } from "@sveltejs/kit";

import { resolveShareLink } from "#lib/server/share-links.ts";

/**
 * What the share page needs before it hands over to ExportReview. No user involved:
 * 404 / 410 from the token, the guest from the cookie.
 */
export const getShareInfo = query(v.string(), async (token) => {
	const link = await resolveShareLink(token);
	const guest = await findShareGuest(getRequestEvent().cookies, link);
	return {
		exportId: link.export.id,
		exportName: link.export.name,
		note: link.note,
		timelinePanelVisible: link.timelinePanelVisible,
		markerPanelVisible: link.markerPanelVisible,
		/** A screening: guests start muted and get the low-quality video */
		screening: link.kind === "SCREENING",
		/** No room for a new guest; who joined before still gets in */
		full: !guest && (await isShareLinkFull(link)),
		guest: guest && { name: guest.name },
		// Only someone who can leave markers has to say who they are
		needsName: link.markerPanelVisible && !guest?.name,
	};
});

export const joinShare = command(
	v.object({ token: v.string(), name: v.optional(shareGuestName) }),
	async ({ token, name }) => {
		const { cookies } = getRequestEvent();
		const link = await resolveShareLink(token);
		if (link.markerPanelVisible && !name) error(400, "Enter your name");

		const guest = await findShareGuest(cookies, link);
		if (!guest) {
			await createShareGuest(cookies, link, name ?? null);
		} else if (name && !guest.name) {
			// Joined while markers were off; the link shows them now
			await prisma.shareGuest.update({ where: { id: guest.id }, data: { name } });
		}
		// Otherwise (double click, two tabs) the existing guest stays as it is
		await getShareInfo(token).refresh();
	},
);

/** A reload within this time is the same visit */
const VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * Called once when a guest opens the share view. Counts visits (not reloads) and remembers
 * when the link and this guest were last seen; the team sees both in the share modal.
 */
export const recordShareView = command(v.string(), async (token) => {
	const { link, guest } = await requireShareGuest(token, getRequestEvent().cookies);
	const now = new Date();
	const newVisit =
		!guest.lastViewedAt || now.getTime() - guest.lastViewedAt.getTime() > VISIT_GAP_MS;

	await prisma.$transaction([
		prisma.shareGuest.update({ where: { id: guest.id }, data: { lastViewedAt: now } }),
		prisma.shareLink.update({
			where: { id: link.id },
			data: { lastViewedAt: now, ...(newVisit && { viewCount: { increment: 1 } }) },
		}),
	]);
});
