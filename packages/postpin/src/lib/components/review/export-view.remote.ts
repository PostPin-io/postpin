import * as env from "$app/env/private";
import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import { s3PresignClient } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import { getMediaJobs } from "#lib/server/media.ts";
import { requireMediaAccess } from "#lib/server/org-access.ts";
import { readExport, readMedia, requireTimeline, urlLifetime } from "#lib/server/review-access.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { seekSpriteUrls, shotThumbnailUrls } from "#lib/server/media-assets.ts";
import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

/** Set by the share page: the call is a share-link guest's (see readExport / readMedia) */
const shareToken = v.optional(v.string());

/** Without the timeline panel a guest gets the snapshot's timing, but no clips, names or metadata */
function timingOnly(snapshot: unknown) {
	if (!snapshot) return snapshot;
	return { ...(snapshot as TimelineSnapshot), name: "", tracks: [], mediaItems: [], metadata: {} };
}

export const getExport = query(
	v.object({
		exportId: v.string(),
		projectId: v.optional(v.string()),
		timelineId: v.optional(v.string()),
		shareToken,
	}),
	async ({ projectId, timelineId, exportId, shareToken }) => {
		const reader = await readExport(exportId, shareToken);

		// members: the page's project and timeline must match the export (guests don't know them)
		if (
			reader.kind === "member" &&
			(reader.target.projectId !== projectId || reader.target.timelineId !== timelineId)
		) {
			error(404, "Not found");
		}

		const exp = await prisma.export.findUnique({
			where: { id: exportId },
			include: {
				media: {
					include: {
						original: { omit: { hls: true } },
						proxies: true,
						thumbnail: true,
					},
				},
			},
		});
		if (!exp) error(404, "Not found");

		const media = exp.media && {
			...exp.media,
			// the byte ranges are only for the playlist routes; the page polls this every second while processing
			proxies: exp.media.proxies.map(({ hls, ...proxy }) => ({ ...proxy, hasHls: hls !== null })),
		};
		const hideClips = reader.kind === "guest" && !reader.link.timelinePanelVisible;
		return {
			...exp,
			media,
			timelineSnapshot: (hideClips
				? timingOnly(exp.timelineSnapshot)
				: exp.timelineSnapshot) as typeof exp.timelineSnapshot,
		};
	},
);

export const getProcessingJobs = query(v.object({ mediaId: v.string() }), async ({ mediaId }) => {
	await requireMediaAccess(mediaId);
	return await getMediaJobs(mediaId);
});

export const getUrl = query(
	v.object({
		mediaId: v.string(),
		type: v.picklist(["original", "proxy", "thumbnail"]),
		proxyId: v.optional(v.string()),
		shareToken,
	}),
	async ({ shareToken, ...object }) => {
		const reader = await readMedia(object.mediaId, shareToken);
		// guests stream HLS; the original and single proxy files stay with the team
		if (reader.kind === "guest" && object.type !== "thumbnail") error(403, "Not shared");
		return await getPresignedUrl(s3PresignClient, env, object, "get", urlLifetime(reader));
	},
);

export const getSeekSprites = query(
	v.object({ mediaId: v.string(), shareToken }),
	async ({ mediaId, shareToken }) => {
		const reader = await readMedia(mediaId, shareToken);
		return (
			(await seekSpriteUrls(mediaId, urlLifetime(reader))) ?? error(404, "Seek sprites not found")
		);
	},
);

export const getShotThumbnails = query(
	v.object({ mediaId: v.string(), shareToken }),
	async ({ mediaId, shareToken }) => {
		const reader = await readMedia(mediaId, shareToken);
		requireTimeline(reader);
		return (
			(await shotThumbnailUrls(mediaId, urlLifetime(reader))) ??
			error(404, "Shot thumbnails not found")
		);
	},
);

export const getMovieBarcode = query(
	v.object({ mediaId: v.string(), shareToken }),
	async ({ mediaId, shareToken }) => {
		requireTimeline(await readMedia(mediaId, shareToken));
		const media = await prisma.media.findUniqueOrThrow({
			where: { id: mediaId },
			select: { movieBarcode: true },
		});
		return media.movieBarcode as MovieBarcode | null;
	},
);
