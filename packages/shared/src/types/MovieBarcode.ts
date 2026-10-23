import * as v from "valibot";

export const movieBarcode = v.object({
	interval: v.number(),
	count: v.number(),
	colors: v.string(),
});

export type MovieBarcode = v.InferOutput<typeof movieBarcode>;
