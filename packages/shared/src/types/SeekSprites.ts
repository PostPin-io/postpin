import * as v from "valibot";

export const seekSprites = v.object({
	interval: v.number(),
	tileWidth: v.number(),
	tileHeight: v.number(),
	columns: v.number(),
	rows: v.number(),
	count: v.number(),
	sheets: v.number(),
});

export type SeekSprites = v.InferOutput<typeof seekSprites>;
