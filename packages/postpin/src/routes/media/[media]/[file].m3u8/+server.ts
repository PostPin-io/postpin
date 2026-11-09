import { renditionPlaylist } from "#lib/server/playlists.ts";
import { readMedia, urlLifetime } from "#lib/server/review-access.ts";
import type { RequestHandler } from "@sveltejs/kit";

/** `?share=<token>`: a share-link guest (see readMedia), otherwise a member */
export const GET: RequestHandler = async ({ params, url }) => {
	const reader = await readMedia(params.media!, url.searchParams.get("share") ?? undefined);
	return renditionPlaylist(params.media!, params.file!, urlLifetime(reader));
};
