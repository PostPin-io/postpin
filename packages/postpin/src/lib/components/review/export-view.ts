import type { ThumbnailImage } from "@videojs/html";
import type { SeekSprites } from "@postpin-io/shared/types/SeekSprites";
import { TIMELINE_MODES, type TimelineMode } from "#lib/components/review/video-player.ts";

/** Pane sizes in percent: main = [video column, marker panel], left = [video, timeline] */
export type PaneLayout = {
	main: number[];
	left: number[];
};

export const DEFAULT_LAYOUT: PaneLayout = {
	main: [75, 25],
	left: [65, 35],
};

export const defaultLayout = (): PaneLayout => ({
	main: [...DEFAULT_LAYOUT.main],
	left: [...DEFAULT_LAYOUT.left],
});

const validSizes = (sizes: unknown, count: number): sizes is number[] =>
	Array.isArray(sizes) &&
	sizes.length === count &&
	sizes.every((size) => typeof size === "number" && Number.isFinite(size) && size >= 0) &&
	sizes.reduce((sum, size) => sum + size, 0) > 0;

/** Stored layout JSON → layout; anything invalid falls back to the defaults, per key. */
export function parsePaneLayout(raw: string | null): PaneLayout {
	try {
		const saved = JSON.parse(raw ?? "null");
		return {
			main: validSizes(saved?.main, 2) ? [...saved.main] : [...DEFAULT_LAYOUT.main],
			left: validSizes(saved?.left, 2) ? [...saved.left] : [...DEFAULT_LAYOUT.left],
		};
	} catch {
		return defaultLayout();
	}
}

/** Scales sizes so they add up to 100; all-zero becomes an even split. */
export function normalizeSizes(sizes: number[]): number[] {
	const total = sizes.reduce((sum, size) => sum + size, 0);
	if (total <= 0) return sizes.map(() => 100 / sizes.length);
	return sizes.map((size) => (size / total) * 100);
}

/** Stored video quality (a rendition height) → number, or "auto" for anything else. */
export function parseQuality(raw: string | null): number | "auto" {
	const saved = Number(raw);
	return saved > 0 ? saved : "auto";
}

export function parseTimelineMode(raw: string | null): TimelineMode {
	return TIMELINE_MODES.find((mode) => mode === raw) ?? "full";
}

/** One thumbnail per sprite tile, laid out row by row across the sheets. */
export function seekThumbnailTiles(sprites: SeekSprites, urls: string[]): ThumbnailImage[] {
	if (urls.length === 0) return [];
	const perSheet = sprites.columns * sprites.rows;
	return Array.from({ length: sprites.count }, (_, i) => ({
		url: urls[Math.floor(i / perSheet)]!,
		startTime: i * sprites.interval,
		endTime: (i + 1) * sprites.interval,
		width: sprites.tileWidth,
		height: sprites.tileHeight,
		coords: {
			x: (i % sprites.columns) * sprites.tileWidth,
			y: Math.floor((i % perSheet) / sprites.columns) * sprites.tileHeight,
		},
	}));
}

/** Last playhead position in seconds per export, most recently saved last */
export type StoredPlayheads = Record<string, number>;

// Enough for the exports someone switches between; older entries are dropped so the key doesn't grow forever
export const MAX_STORED_PLAYHEADS = 50;

export function parsePlayheads(raw: string | null): StoredPlayheads {
	try {
		const parsed: unknown = JSON.parse(raw ?? "");
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, number] =>
					typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
			),
		);
	} catch {
		return {};
	}
}

/** Stores `seconds` for the export as the newest entry, keeping at most `MAX_STORED_PLAYHEADS`. */
export function withPlayhead(
	stored: StoredPlayheads,
	exportId: string,
	seconds: number,
): StoredPlayheads {
	const entries = [
		...Object.entries(stored).filter(([id]) => id !== exportId),
		[exportId, seconds] as const,
	];
	return Object.fromEntries(entries.slice(-MAX_STORED_PLAYHEADS));
}
