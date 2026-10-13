import * as env from "$app/env/private";
import { command, query } from "$app/server";
import { s3Client } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import { getMediaJobs, startMediaProcessing } from "#lib/server/media.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin/shared/storage";

export const getVideos = query(async () => {
	const videos = await prisma.media.findMany({
		include: {
			original: true,
			proxies: true,
			thumbnail: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});
	return Promise.all(
		videos.map(async (video) => ({
			...video,
			jobs:
				video.status === "PROCESSING" || video.status === "FAILED"
					? await getMediaJobs(video.id)
					: [],
		})),
	);
});

export const getUploadUrl = command(async () => {
	const mediaId = crypto.randomUUID();
	const uploadUrl = await getPresignedUrl(s3Client, env, { mediaId, type: "original" }, "put");

	await prisma.media.create({
		data: {
			id: mediaId,
			status: "PENDING",
			original: { create: {} },
		},
	});

	return { mediaId, uploadUrl };
});

export const processVideo = command(v.string(), async (mediaId: string) => {
	await startMediaProcessing(mediaId);
});

export const getUrl = query(
	v.object({
		mediaId: v.string(),
		type: v.picklist(["original", "proxy", "thumbnail"]),
		proxyId: v.optional(v.string()),
	}),
	async (object) => {
		return await getPresignedUrl(s3Client, env, object);
	},
);
