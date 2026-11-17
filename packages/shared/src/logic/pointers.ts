// Pointers: arrows and boxes on the video picture that give a marker visual context.
// Every coordinate is a fraction (0..1) of the picture, not of the player: the player letterboxes
// the video, and renditions differ in resolution.
import * as v from "valibot";
import { lastFrameOf, type FrameRange } from "./ranges.ts";

export type PointerKind = "ARROW" | "RECT";

/** Picked to stand apart from typical footage; light and dark ones for dark and bright shots */
export const POINTER_COLORS = [
	"#CE272D", // Flag Red
	"#146D2D", // Turf Green
	"#5A68E5", // Electric Sapphire
	"#11CFE4", // Strong Cyan
	"#081212", // Onyx
	"#EEDCF5", // Lavender Veil
] as const;
export type PointerColor = (typeof POINTER_COLORS)[number];
export const DEFAULT_POINTER_COLOR: PointerColor = "#CE272D";

export const MAX_POINTERS_PER_MARKER = 20;
/** Smallest box side, as a fraction of the picture; a smaller drag is too small to point at anything */
export const MIN_BOX_SIZE = 0.005;
/** A drag shorter than this (CSS pixels) is a click and places an arrow */
export const CLICK_THRESHOLD_PX = 4;
/** Arrow length as a fraction of the picture height, so it looks the same at every player size */
export const ARROW_LENGTH = 0.12;
// Matches the CHECK on marker_pointer: absorbs float rounding at the right and bottom edge
const EDGE_TOLERANCE = 1e-9;

export interface Point {
	x: number;
	y: number;
}
export interface Size {
	width: number;
	height: number;
}
export interface Box extends Point, Size {}

export type PointerGeometry = ({ kind: "ARROW" } & Point) | ({ kind: "RECT" } & Box);

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A marker's pointers show on a point marker's own frame, and anywhere inside a range */
export const pointersVisibleAt = (marker: FrameRange, frame: number) =>
	frame >= marker.frame && frame <= lastFrameOf(marker);

/** Where the picture sits inside its element with object-fit: contain (letterbox or pillarbox) */
export function pictureBox(container: Size, video: Size): Box {
	if (!(video.width > 0 && video.height > 0) || !(container.width > 0 && container.height > 0)) {
		// No metadata yet: assume the picture fills the element
		return {
			x: 0,
			y: 0,
			width: Math.max(container.width, 0),
			height: Math.max(container.height, 0),
		};
	}
	const scale = Math.min(container.width / video.width, container.height / video.height);
	const width = video.width * scale;
	const height = video.height * scale;
	return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/** A point in the element (CSS px) as a fraction of the picture, clamped onto it */
export function toPicture(point: Point, picture: Box): Point {
	if (picture.width <= 0 || picture.height <= 0) return { x: 0, y: 0 };
	return {
		x: clamp((point.x - picture.x) / picture.width, 0, 1),
		y: clamp((point.y - picture.y) / picture.height, 0, 1),
	};
}

/** A picture fraction as a point in the element (CSS px) */
export function fromPicture(point: Point, picture: Box): Point {
	return { x: picture.x + point.x * picture.width, y: picture.y + point.y * picture.height };
}

/** Whether a drag (CSS px) was short enough to be a click */
export const isClick = (from: Point, to: Point, threshold = CLICK_THRESHOLD_PX) =>
	Math.hypot(to.x - from.x, to.y - from.y) < threshold;

/** The box spanned by two corners (picture fractions), in any order, kept on the picture */
export function boxFromCorners(a: Point, b: Point): Box {
	const left = clamp(Math.min(a.x, b.x), 0, 1);
	const top = clamp(Math.min(a.y, b.y), 0, 1);
	const right = clamp(Math.max(a.x, b.x), 0, 1);
	const bottom = clamp(Math.max(a.y, b.y), 0, 1);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Whether a box is big enough to keep; smaller drags are discarded */
export const isUsableBox = (box: Size) => box.width >= MIN_BOX_SIZE && box.height >= MIN_BOX_SIZE;

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Drags one corner of a box to a point; the opposite corner stays put. Pass the box as it was when the
 * drag started: crossing the opposite corner then flips the box instead of collapsing it.
 */
export function resizeBox(box: Box, corner: Corner, to: Point): Box {
	const opposite = {
		x: corner.endsWith("w") ? box.x + box.width : box.x,
		y: corner.startsWith("n") ? box.y + box.height : box.y,
	};
	const next = boxFromCorners(opposite, to);
	// Never smaller than a usable box: keeps the handles grabbable
	return {
		...next,
		width: Math.max(next.width, Math.min(MIN_BOX_SIZE, 1 - next.x)),
		height: Math.max(next.height, Math.min(MIN_BOX_SIZE, 1 - next.y)),
	};
}

/** Moves a pointer by a delta (picture fractions); a box stops at the edges with its size intact */
export function movePointer<T extends PointerGeometry>(pointer: T, dx: number, dy: number): T {
	if (pointer.kind === "ARROW") {
		return { ...pointer, x: clamp(pointer.x + dx, 0, 1), y: clamp(pointer.y + dy, 0, 1) };
	}
	const box = pointer as T & Box;
	return {
		...box,
		x: clamp(box.x + dx, 0, 1 - box.width),
		y: clamp(box.y + dy, 0, 1 - box.height),
	};
}

/**
 * Where an arrow's tail sits (picture fractions). The arrow always comes in at 45° from the lower right
 * and flips to the other side where the picture ends. Worked out in pixels, so the angle stays 45° on
 * every aspect ratio.
 */
export function arrowTail(tip: Point, picture: Size, length = ARROW_LENGTH): Point {
	if (picture.width <= 0 || picture.height <= 0) return tip;
	const offset = (length * picture.height) / Math.SQRT2;
	const tipX = tip.x * picture.width;
	const tipY = tip.y * picture.height;
	const tailX = tipX + offset <= picture.width ? tipX + offset : tipX - offset;
	const tailY = tipY + offset <= picture.height ? tipY + offset : tipY - offset;
	return {
		x: clamp(tailX / picture.width, 0, 1),
		y: clamp(tailY / picture.height, 0, 1),
	};
}

// ─── Validation of client input (remote functions) ───────────────────────────
const fraction = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1));
const side = v.pipe(v.number(), v.finite(), v.minValue(MIN_BOX_SIZE), v.maxValue(1));

export const pointerColorSchema = v.picklist(POINTER_COLORS);

export const pointerGeometrySchema = v.pipe(
	v.variant("kind", [
		v.object({ kind: v.literal("ARROW"), x: fraction, y: fraction }),
		v.object({ kind: v.literal("RECT"), x: fraction, y: fraction, width: side, height: side }),
	]),
	v.check(
		(p) =>
			p.kind === "ARROW" ||
			(p.x + p.width <= 1 + EDGE_TOLERANCE && p.y + p.height <= 1 + EDGE_TOLERANCE),
		"The box must lie inside the picture",
	),
);
