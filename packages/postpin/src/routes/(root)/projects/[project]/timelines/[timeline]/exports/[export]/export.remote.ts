import * as env from "$app/env/private";
import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import { s3Client } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import { getMediaJobs } from "#lib/server/media.ts";
import { requireMediaAccess } from "#lib/server/org-access.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { seekSprites, type SeekSprites } from "@postpin-io/shared/types/SeekSprites";
import type { ShotThumbnails } from "@postpin-io/shared/types/ShotThumbnails";
import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";

export const getExport = query(
	v.object({ projectId: v.string(), timelineId: v.string(), exportId: v.string() }),
	async ({ projectId, timelineId, exportId }) => {
		const { user } = getRequestEvent().locals;
		if (!user) error(401, "Not signed in");

		const exp = await prisma.export.findFirst({
			where: {
				id: exportId,
				timelineId,
				timeline: {
					projectId,
					project: { organization: { members: { some: { userId: user.id } } } },
				},
			},
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
		if (!exp) error(404, "Export not found");

		const media = exp.media && {
			...exp.media,
			// the byte ranges are only for the playlist routes; the page polls this every second while processing
			proxies: exp.media.proxies.map(({ hls, ...proxy }) => ({ ...proxy, hasHls: hls !== null })),
		};
		return { ...exp, media };
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
	}),
	async (object) => {
		await requireMediaAccess(object.mediaId);
		return await getPresignedUrl(s3Client, env, object);
	},
);

export const getSeekSprites = query(
	v.object({
		mediaId: v.string(),
	}),
	async (object) => {
		await requireMediaAccess(object.mediaId);
		const media = await prisma.media.findUnique({
			where: { id: object.mediaId },
			select: { seekSprites: true },
		});
		if (!media?.seekSprites) error(404, "Seek sprites not found");
		const { sheets } = v.parse(seekSprites, media.seekSprites);
		return {
			seekSprites: media.seekSprites as SeekSprites,
			urls: await Promise.all(
				Array.from({ length: sheets }, (_, index) =>
					getPresignedUrl(s3Client, env, { mediaId: object.mediaId, type: "sprite", index }),
				),
			),
		};
	},
);

export const getShotThumbnails = query(
	v.object({
		mediaId: v.string(),
	}),
	async (object) => {
		await requireMediaAccess(object.mediaId);
		const media = await prisma.media.findUnique({
			where: { id: object.mediaId },
			select: { shotThumbnails: true },
		});
		if (!media?.shotThumbnails) error(404, "Shot thumbnails not found");
		const { count, width, height } = media.shotThumbnails as ShotThumbnails;
		return {
			count,
			width,
			height,
			urls: await Promise.all(
				Array.from({ length: count }, (_, index) =>
					getPresignedUrl(s3Client, env, {
						mediaId: object.mediaId,
						type: "shotThumbnails",
						index,
					}),
				),
			),
		};
	},
);

export const getMovieBarcode = query(
	v.object({
		mediaId: v.string(),
	}),
	async (object) => {
		await requireMediaAccess(object.mediaId);
		const media = await prisma.media.findUniqueOrThrow({
			where: { id: object.mediaId },
			select: { movieBarcode: true },
		});
		return media?.movieBarcode as MovieBarcode | null;
	},
);
