import { error } from "@sveltejs/kit";
import { command } from "$app/server";
import * as v from "valibot";
import { shareLinkStatus } from "@postpin-io/shared/logic/share-links";
import { prisma } from "#lib/server/database.ts";
import { endLiveScreening, setLiveScreening } from "#lib/server/live.ts";
import { authorize } from "#lib/server/org-access.ts";

// The presenter's side of a running screening (see screening-live.ts). Whoever may run the
// screening of a link (edit it, like resumeScreeningLink) may say where its playhead is.

/** The presenter's ScreeningSession: one at a time runs a link's screening */
const sessionId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

const playhead = v.object({
	time: v.pipe(v.number(), v.finite(), v.minValue(0)),
	paused: v.boolean(),
	rate: v.pipe(v.number(), v.finite(), v.minValue(-16), v.maxValue(16)),
});

/**
 * Where the screening window is; also the heartbeat that keeps the screening running.
 * `claim`: a new session takes the screening over. 409 for a session that was taken over
 * (another tab started it again, an old one that lived on) or ended: it stops sending.
 */
export const publishScreening = command(
	v.object({ linkId: v.string(), sessionId, playhead, claim: v.optional(v.boolean(), false) }),
	async ({ linkId, sessionId, playhead, claim }) => {
		await authorize("shareLink", "update", { type: "shareLink", id: linkId });
		const link = await prisma.shareLink.findUniqueOrThrow({
			where: { id: linkId },
			select: { kind: true, expiresAt: true, revokedAt: true },
		});
		if (link.kind !== "SCREENING") error(400, "Not a screening link");
		// 410, not 409: that one means "taken over", and the session would give up for good
		if (shareLinkStatus(link) !== "active") error(410, "This link is no longer active");
		if (!(await setLiveScreening(linkId, sessionId, playhead, claim))) {
			error(409, "This screening is run from another window now");
		}
	},
);

/** The screening ended: its guests get the normal share view. Only from the session running it. */
export const endScreening = command(
	v.object({ linkId: v.string(), sessionId }),
	async ({ linkId, sessionId }) => {
		await authorize("shareLink", "update", { type: "shareLink", id: linkId });
		await endLiveScreening(linkId, sessionId);
	},
);
