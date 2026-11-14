import { isLowestRendition, renditionPlaylist } from "#lib/server/playlists.ts";
import { isScreeningGuest, readMedia, urlLifetime } from "#lib/server/review-access.ts";
import { error, type RequestHandler } from "@sveltejs/kit";

/** `?share=<token>`: a share-link guest (see readMedia), otherwise a member */
export const GET: RequestHandler = async ({ params, url }) => {
	const reader = await readMedia(params.media!, url.searchParams.get("share") ?? undefined);
	// the master playlist lists only the smallest one for them; asking for another by id gets nothing
	if (isScreeningGuest(reader) && !(await isLowestRendition(params.media!, params.file!))) {
		error(404, "Rendition not found");
	}
	return renditionPlaylist(params.media!, params.file!, urlLifetime(reader));
};
