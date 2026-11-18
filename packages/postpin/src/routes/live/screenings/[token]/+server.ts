import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { liveChannel, type LiveScreening } from "@postpin-io/shared/live";
import type { ScreeningMessage } from "#lib/components/screening/screening-live.ts";
import { getLiveScreening, guestStreamLifetime, liveStream } from "#lib/server/live.ts";
import { requireShareGuest } from "#lib/server/share-guests.ts";

/**
 * The presenter's playhead for the guests of a screening link (ScreeningFollower). Public
 * path (see hooks.server.ts): only a guest of this link gets it, like everything on the link.
 * Every (re)connect starts with the current state, so nothing missed meanwhile is lost.
 */
export const GET: RequestHandler = async ({ params, request, cookies }) => {
	const { link } = await requireShareGuest(params.token, cookies);
	if (link.kind !== "SCREENING") error(404, "Not a screening link");

	// With the server's clock, so the guest can tell how old the state is (see ScreeningFollower)
	const message = (state: LiveScreening | null) =>
		({ type: "screening", state, now: Date.now() }) satisfies ScreeningMessage & { type: string };
	const sendCurrent = async (send: (data: unknown) => void) =>
		send(message(await getLiveScreening(link.id)));

	return liveStream(
		request,
		[liveChannel.screening(link.id)],
		guestStreamLifetime(link.expiresAt),
		{
			start: (send) => void sendCurrent(send),
			forward: (event, send) => {
				// Redis was gone for a moment: what is current now
				if (event.type === "resync") void sendCurrent(send);
				else if (event.type === "screening") send(message(event.state));
			},
		},
	);
};
