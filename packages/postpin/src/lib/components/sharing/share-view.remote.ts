import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { shareGuestName } from "@postpin-io/shared/logic/share-links";
import { createShareGuest, findShareGuest } from "#lib/server/share-guests.ts";
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
		guest: guest && { name: guest.name },
	};
});

export const joinShare = command(
	v.object({ token: v.string(), name: shareGuestName }),
	async ({ token, name }) => {
		const { cookies } = getRequestEvent();
		const link = await resolveShareLink(token);
		// Submitting twice (double click, two tabs) keeps the existing guest
		if (!(await findShareGuest(cookies, link))) await createShareGuest(cookies, link, name);
		await getShareInfo(token).refresh();
	},
);
