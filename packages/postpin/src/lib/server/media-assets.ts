import * as env from "$app/env/private";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { seekSprites, type SeekSprites } from "@postpin-io/shared/types/SeekSprites";
import type { ShotThumbnails } from "@postpin-io/shared/types/ShotThumbnails";
import { prisma } from "#lib/server/database.ts";
import { s3PresignClient } from "#lib/server/storage.ts";

/** Default of getPresignedUrl; guests pass a shorter one (shareUrlLifetime) */
const DEFAULT_LIFETIME = 60 * 60;

/** null while the media has none (not generated yet). Callers check access first. */
export async function seekSpriteUrls(mediaId: string, lifetime = DEFAULT_LIFETIME) {
	const media = await prisma.media.findUnique({
		where: { id: mediaId },
		select: { seekSprites: true },
	});
	if (!media?.seekSprites) return null;
	const { sheets } = v.parse(seekSprites, media.seekSprites);
	return {
		seekSprites: media.seekSprites as SeekSprites,
		urls: await Promise.all(
			Array.from({ length: sheets }, (_, index) =>
				getPresignedUrl(s3PresignClient, env, { mediaId, type: "sprite", index }, "get", lifetime),
			),
		),
	};
}

/** null while the media has none (not generated yet). Callers check access first. */
export async function shotThumbnailUrls(mediaId: string, lifetime = DEFAULT_LIFETIME) {
	const media = await prisma.media.findUnique({
		where: { id: mediaId },
		select: { shotThumbnails: true },
	});
	if (!media?.shotThumbnails) return null;
	const { count, width, height } = media.shotThumbnails as ShotThumbnails;
	return {
		count,
		width,
		height,
		urls: await Promise.all(
			Array.from({ length: count }, (_, index) =>
				getPresignedUrl(
					s3PresignClient,
					env,
					{ mediaId, type: "shotThumbnails", index },
					"get",
					lifetime,
				),
			),
		),
	};
}
