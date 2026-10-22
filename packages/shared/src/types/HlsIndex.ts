import * as v from "valibot";

export const hlsInfo = v.object({
	init: v.object({
		offset: v.number(),
		length: v.number(),
	}),
	segments: v.array(
		v.object({
			duration: v.number(),
			offset: v.number(),
			length: v.number(),
		}),
	),
});

export type HlsInfo = v.InferOutput<typeof hlsInfo>;
