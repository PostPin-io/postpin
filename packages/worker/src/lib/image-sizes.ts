import { measureMediaImages } from "@postpin-io/shared/storage";
import { prisma } from "./database.ts";
import { env } from "./env.ts";
import { s3Client } from "./storage.ts";

/** Stores what the thumbnail, seek sprites and shot thumbnails take up in the bucket */
export async function storeImageSizes(mediaId: string) {
	const sizes = await measureMediaImages(s3Client, env, mediaId);
	await prisma.media.update({ where: { id: mediaId }, data: sizes });
}
