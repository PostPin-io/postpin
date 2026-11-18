import { masterPlaylist } from "#lib/server/playlists.ts";
import { readMedia } from "#lib/server/review-access.ts";
import type { RequestHandler } from "@sveltejs/kit";

/** `?share=<token>`: a share-link guest (see readMedia), otherwise a member */
export const GET: RequestHandler = async ({ params, url }) => {
	const shareToken = url.searchParams.get("share") ?? undefined;
	await readMedia(params.media!, shareToken);
	return masterPlaylist(
		params.media!,
		shareToken ? `?share=${encodeURIComponent(shareToken)}` : "",
	);
};
