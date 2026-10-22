import * as v from "valibot";

export const shotThumbnails = v.object({
	width: v.number(),
	height: v.number(),
	count: v.number(),
});

export type ShotThumbnails = v.InferOutput<typeof shotThumbnails>;
