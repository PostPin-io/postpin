import * as v from "valibot";

/**
 * The published shot thumbnails of a media. Each render is a generation with its own S3 keys
 * (see getS3ObjectPath), so a render that was overtaken by a newer one can't overwrite its images.
 */
export const shotThumbnails = v.object({
	width: v.number(),
	height: v.number(),
	count: v.number(),
	/** Missing on thumbnails rendered before generations existed: their keys have none */
	generation: v.optional(v.string()),
	/**
	 * While the render runs: the shots 0 … ready - 1 have their image, the others not yet.
	 * Missing once every image is there.
	 */
	ready: v.optional(v.number()),
});

export type ShotThumbnails = v.InferOutput<typeof shotThumbnails>;

/**
 * A new generation id. Starts with the time, fixed width, so newer generations sort after older
 * ones as plain strings; the random tail keeps two renders in the same millisecond apart.
 */
export function newShotThumbnailsGeneration(now = Date.now()): string {
	const time = now.toString(36).padStart(9, "0");
	const random = Math.floor(Math.random() * 36 ** 4)
		.toString(36)
		.padStart(4, "0");
	return `${time}${random}`;
}

/** How many shots have their image, counted from the first: all once the render is done */
export const readyShotThumbnails = (t: ShotThumbnails) => Math.min(t.ready ?? t.count, t.count);

/**
 * Whether shot thumbnails are on their way: a render was requested that isn't published yet (the
 * cuts changed: the requested generation differs from the published one), or the published one
 * is still rendering. Media from before generations have neither, so nothing is pending for them.
 */
export function shotThumbnailsPending(media: {
	shotThumbnailsGeneration: string | null;
	shotThumbnails: unknown;
}): boolean {
	const published = media.shotThumbnails as ShotThumbnails | null;
	if ((media.shotThumbnailsGeneration ?? null) !== (published?.generation ?? null)) return true;
	return !!published && readyShotThumbnails(published) < published.count;
}
