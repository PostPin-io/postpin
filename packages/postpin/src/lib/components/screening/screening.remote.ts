import { error } from "@sveltejs/kit";
import { command } from "$app/server";
import * as v from "valibot";
import { shareLinkStatus } from "@postpin-io/shared/logic/share-links";
import { prisma } from "#lib/server/database.ts";
import { endLiveScreening, setLiveScreening } from "#lib/server/live.ts";
import { authorize } from "#lib/server/org-access.ts";

// The presenter's side of a running screening (see screening-live.ts). Whoever may run the
// screening of a link (edit it, like resumeScreeningLink) may say where its playhead is.

const playhead = v.object({
	time: v.pipe(v.number(), v.finite(), v.minValue(0)),
	paused: v.boolean(),
	rate: v.pipe(v.number(), v.finite(), v.minValue(-16), v.maxValue(16)),
});

/** Where the screening window is; also the heartbeat that keeps the screening running */
export const publishScreening = command(
	v.object({ linkId: v.string(), playhead }),
	async ({ linkId, playhead }) => {
		await authorize("shareLink", "update", { type: "shareLink", id: linkId });
		const link = await prisma.shareLink.findUniqueOrThrow({
			where: { id: linkId },
			select: { kind: true, expiresAt: true, revokedAt: true },
		});
		if (link.kind !== "SCREENING") error(400, "Not a screening link");
		if (shareLinkStatus(link) !== "active") error(409, "This link is no longer active");
		await setLiveScreening(linkId, playhead);
	},
);

/** The screening ended: its guests get the normal share view, with the video */
export const endScreening = command(v.object({ linkId: v.string() }), async ({ linkId }) => {
	await authorize("shareLink", "update", { type: "shareLink", id: linkId });
	await endLiveScreening(linkId);
});
