import { prisma } from "./db.ts";
import * as f from "./factories.ts";

const HOUR = 60 * 60 * 1000;

/**
 * Export with media whose files take up storage: an original of `original` bytes, one proxy
 * per entry of `proxies` and the measured image sizes in `images`. Media is COMPLETED unless
 * `status` says otherwise.
 */
export async function storedExport(
	timeline: { id: string },
	data: {
		original: number;
		proxies?: number[];
		images?: { thumbnail?: number; seekSprites?: number; shotThumbnails?: number };
		uploadedBy?: { id: string };
		status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
		createdAt?: Date;
		/** PENDING only; default: reserved for another day */
		reservedUntil?: Date;
	},
) {
	const exp = await f.createExport(timeline, { media: true });
	const status = data.status ?? "COMPLETED";
	const media = await prisma.media.update({
		where: { id: exp.mediaId! },
		data: {
			status,
			...(data.createdAt && { createdAt: data.createdAt }),
			...(status === "PENDING" && {
				reservedUntil: data.reservedUntil ?? new Date(Date.now() + 24 * HOUR),
			}),
			original: { update: { size: BigInt(data.original) } },
			...(data.images && {
				thumbnailSize: BigInt(data.images.thumbnail ?? 0),
				seekSpritesSize: BigInt(data.images.seekSprites ?? 0),
				shotThumbnailsSize: BigInt(data.images.shotThumbnails ?? 0),
			}),
			proxies: {
				create: (data.proxies ?? []).map((size, i) => ({
					size: BigInt(size),
					height: 1080 - i * 360,
				})),
			},
		},
	});
	if (data.uploadedBy) {
		await prisma.export.update({
			where: { id: exp.id },
			data: { uploadedById: data.uploadedBy.id },
		});
	}
	return { ...exp, uploadedById: data.uploadedBy?.id ?? null, media };
}
