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
