import type { RequestHandler } from "./$types";
import { liveChannel, type LiveScreening } from "@postpin-io/shared/live";
import type { ScreeningMessage } from "#lib/components/screening/screening-live.ts";
import { getLiveScreening, guestStreamLifetime, liveStream } from "#lib/server/live.ts";
import { requireShareGuest } from "#lib/server/share-guests.ts";
import { resolveShareLink } from "#lib/server/share-links.ts";

/**
 * What a share link's guest hears about the link itself (connectShareLink): that it was
 * deleted, and for a screening link the presenter's playhead (ScreeningFollower). Public path
 * (see hooks.server.ts): only a guest of this link gets it, like everything on the link.
 * It ends when the link expires; reconnecting then answers 410, which sends the guest away.
 */
export const GET: RequestHandler = async ({ params, request, cookies }) => {
	const { link } = await requireShareGuest(params.token, cookies);
	const screening = link.kind === "SCREENING";

	// With the server's clock, so the guest can tell how old the state is (see ScreeningFollower).
	// Every (re)connect starts with the current state, so nothing missed meanwhile is lost.
	const message = (state: LiveScreening | null) =>
		({ type: "screening", state, now: Date.now() }) satisfies ScreeningMessage & { type: string };
	const sendCurrent = async (send: (data: unknown) => void) =>
		send(message(await getLiveScreening(link.id)));

	return liveStream(
		request,
		[liveChannel.shareLink(link.id)],
		guestStreamLifetime(link.expiresAt),
		{
			start: screening ? (send) => void sendCurrent(send) : undefined,
			forward: (event, send) => {
				if (event.type === "shareLinkRevoked") return send({ type: "revoked" });
				if (event.type === "resync") {
					// Redis was gone for a moment: a deletion meanwhile may have been missed
					void resolveShareLink(params.token).then(
						() => {
							if (screening) void sendCurrent(send);
						},
						() => send({ type: "revoked" }),
					);
				} else if (screening && event.type === "screening") send(message(event.state));
			},
		},
	);
};
