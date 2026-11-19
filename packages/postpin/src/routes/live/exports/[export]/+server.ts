import type { RequestHandler } from "./$types";
import { liveChannel } from "@postpin-io/shared/live";
import { readExport, requireMarkers } from "#lib/server/review-access.ts";
import { MAX_STREAM_LIFETIME_MS, guestStreamLifetime, liveStream } from "#lib/server/live.ts";

/**
 * Public path (see hooks.server.ts): access is checked here, the same way as getMarkers.
 * `?share=<token>` = as guest, who only hears about their own markers (multi-tab) and the
 * project's categories, which their markers show.
 */
export const GET: RequestHandler = async ({ params, url, request }) => {
	const exportId = params.export;
	const shareToken = url.searchParams.get("share") ?? undefined;
	const reader = await readExport(exportId, shareToken);
	requireMarkers(reader);

	if (reader.kind === "guest") {
		// The project channel carries no data, only "reload": guests then reload their own markers
		const channels = [
			liveChannel.guest(reader.guest.id),
			liveChannel.project(reader.link.export.timeline.projectId),
		];
		return liveStream(request, channels, guestStreamLifetime(reader.link.expiresAt));
	}
	const channels = [liveChannel.export(exportId)];
	if (reader.target.projectId) channels.push(liveChannel.project(reader.target.projectId));
	return liveStream(request, channels, MAX_STREAM_LIFETIME_MS);
};
