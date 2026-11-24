import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	arrowTail,
	boxFromCorners,
	fromPicture,
	isClick,
	isUsableBox,
	MIN_BOX_SIZE,
	movePointer,
	pictureBox,
	pointerColorSchema,
	pointerGeometrySchema,
	pointerShape,
	pointersVisibleAt,
	resizeBox,
	toPicture,
} from "../../src/logic/pointers.ts";

describe("pointersVisibleAt", () => {
	it("a point marker only on its own frame", () => {
		const marker = { frame: 100, duration: 0 };
		expect(pointersVisibleAt(marker, 99)).toBe(false);
		expect(pointersVisibleAt(marker, 100)).toBe(true);
		expect(pointersVisibleAt(marker, 101)).toBe(false);
	});

	it("a range from its first to its last frame", () => {
		const marker = { frame: 100, duration: 24 };
		expect(pointersVisibleAt(marker, 99)).toBe(false);
		expect(pointersVisibleAt(marker, 100)).toBe(true);
		expect(pointersVisibleAt(marker, 123)).toBe(true);
		expect(pointersVisibleAt(marker, 124)).toBe(false);
	});
});

describe("pictureBox", () => {
	it("letterboxes a wide video in a taller element", () => {
		expect(pictureBox({ width: 1600, height: 1200 }, { width: 1920, height: 1080 })).toEqual({
			x: 0,
			y: 150,
			width: 1600,
			height: 900,
		});
	});

	it("pillarboxes a narrow video in a wider element", () => {
		expect(pictureBox({ width: 2000, height: 900 }, { width: 1920, height: 1080 })).toEqual({
			x: 200,
			y: 0,
			width: 1600,
			height: 900,
		});
	});

	it("fills the element while the video size is unknown", () => {
		expect(pictureBox({ width: 800, height: 450 }, { width: 0, height: 0 })).toEqual({
			x: 0,
			y: 0,
			width: 800,
			height: 450,
		});
	});
});

describe("toPicture / fromPicture", () => {
	const picture = { x: 0, y: 150, width: 1600, height: 900 };

	it("round-trips a point on the picture", () => {
		const point = { x: 400, y: 375 };
		const fraction = toPicture(point, picture);
		expect(fraction).toEqual({ x: 0.25, y: 0.25 });
		expect(fromPicture(fraction, picture)).toEqual(point);
	});

	it("clamps a point in the letterbox onto the picture", () => {
		expect(toPicture({ x: -10, y: 20 }, picture)).toEqual({ x: 0, y: 0 });
		expect(toPicture({ x: 2000, y: 1190 }, picture)).toEqual({ x: 1, y: 1 });
	});
});

describe("isClick", () => {
	it("tells a click from a drag", () => {
		expect(isClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true);
		expect(isClick({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(false);
	});
});

describe("boxFromCorners", () => {
	it("works for a drag in any direction", () => {
		const expected = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
		const a = { x: 0.2, y: 0.3 };
		const b = { x: 0.6, y: 0.5 };
		for (const box of [boxFromCorners(a, b), boxFromCorners(b, a)]) {
			expect(box.x).toBeCloseTo(expected.x);
			expect(box.y).toBeCloseTo(expected.y);
			expect(box.width).toBeCloseTo(expected.width);
			expect(box.height).toBeCloseTo(expected.height);
		}
	});

	it("stays on the picture", () => {
		expect(boxFromCorners({ x: -0.5, y: 0.5 }, { x: 0.5, y: 1.5 })).toEqual({
			x: 0,
			y: 0.5,
			width: 0.5,
			height: 0.5,
		});
	});

	it("tiny drags aren't usable boxes", () => {
		expect(isUsableBox(boxFromCorners({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.6 }))).toBe(false);
		expect(isUsableBox(boxFromCorners({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }))).toBe(true);
	});
});

describe("resizeBox", () => {
	const box = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

	it("keeps the opposite corner", () => {
		const resized = resizeBox(box, "se", { x: 0.8, y: 0.7 });
		expect(resized.x).toBeCloseTo(0.2);
		expect(resized.y).toBeCloseTo(0.2);
		expect(resized.width).toBeCloseTo(0.6);
		expect(resized.height).toBeCloseTo(0.5);
	});

	it("flips when dragged across the opposite corner", () => {
		// nw corner past the se corner (0.6, 0.6)
		const resized = resizeBox(box, "nw", { x: 0.9, y: 0.8 });
		expect(resized.x).toBeCloseTo(0.6);
		expect(resized.y).toBeCloseTo(0.6);
		expect(resized.width).toBeCloseTo(0.3);
		expect(resized.height).toBeCloseTo(0.2);
	});

	it("never collapses below the minimum size", () => {
		const resized = resizeBox(box, "se", { x: 0.2, y: 0.2 });
		expect(resized.width).toBe(MIN_BOX_SIZE);
		expect(resized.height).toBe(MIN_BOX_SIZE);
	});
});

describe("movePointer", () => {
	it("moves an arrow tip and clamps it", () => {
		expect(movePointer({ kind: "ARROW", x: 0.5, y: 0.5 }, 0.1, -0.2)).toEqual({
			kind: "ARROW",
			x: 0.6,
			y: 0.3,
		});
		expect(movePointer({ kind: "ARROW", x: 0.9, y: 0.1 }, 0.5, -0.5)).toEqual({
			kind: "ARROW",
			x: 1,
			y: 0,
		});
	});

	it("stops a box at the edge without shrinking it", () => {
		const moved = movePointer({ kind: "RECT", x: 0.5, y: 0.5, width: 0.3, height: 0.2 }, 0.5, 0.5);
		expect(moved.width).toBe(0.3);
		expect(moved.height).toBe(0.2);
		expect(moved.x).toBeCloseTo(0.7);
		expect(moved.y).toBeCloseTo(0.8);
	});
});

describe("arrowTail", () => {
	const picture = { width: 1920, height: 1080 };

	it("comes in from the lower right at 45°", () => {
		const tip = { x: 0.5, y: 0.5 };
		const tail = arrowTail(tip, picture);
		const dx = (tail.x - tip.x) * picture.width;
		const dy = (tail.y - tip.y) * picture.height;
		expect(dx).toBeGreaterThan(0);
		expect(dy).toBeCloseTo(dx);
		expect(Math.hypot(dx, dy)).toBeCloseTo(0.12 * 1080);
	});

	it("flips where the picture ends", () => {
		const tail = arrowTail({ x: 0.99, y: 0.99 }, picture);
		expect(tail.x).toBeLessThan(0.99);
		expect(tail.y).toBeLessThan(0.99);
	});
});

describe("pointerGeometrySchema", () => {
	const valid = (input: unknown) => v.safeParse(pointerGeometrySchema, input).success;

	it("accepts arrows and boxes on the picture", () => {
		expect(valid({ kind: "ARROW", x: 0, y: 1 })).toBe(true);
		expect(valid({ kind: "RECT", x: 0.7, y: 0.5, width: 0.3, height: 0.5 })).toBe(true);
	});

	it("rejects points and boxes off the picture", () => {
		expect(valid({ kind: "ARROW", x: 1.1, y: 0.5 })).toBe(false);
		expect(valid({ kind: "ARROW", x: Number.NaN, y: 0.5 })).toBe(false);
		expect(valid({ kind: "RECT", x: 0.8, y: 0.5, width: 0.3, height: 0.2 })).toBe(false);
		expect(valid({ kind: "RECT", x: 0.5, y: 0.5, width: 0, height: 0.2 })).toBe(false);
	});

	it("only the known colors", () => {
		expect(v.safeParse(pointerColorSchema, "#CE272D").success).toBe(true);
		expect(v.safeParse(pointerColorSchema, "#123456").success).toBe(false);
	});
});

describe("pointerShape", () => {
	const picture = { x: 10, y: 20, width: 1600, height: 900 };

	it("a box in element pixels, offset by the letterbox", () => {
		expect(
			pointerShape({ kind: "RECT", x: 0.5, y: 0.5, width: 0.25, height: 0.5 }, picture, 4),
		).toEqual({ kind: "RECT", x: 810, y: 470, width: 400, height: 450 });
	});

	it("an arrow ends in a head at its tip", () => {
		const shape = pointerShape({ kind: "ARROW", x: 0.5, y: 0.5 }, picture, 4);
		if (shape.kind !== "ARROW") throw new Error("not an arrow");
		expect(shape.tip).toEqual({ x: 810, y: 470 });
		expect(shape.head[0]).toEqual(shape.tip);
		// Comes in from the lower right at 45°; the line stops 4.5 strokes before the tip
		expect(shape.tail.x).toBeGreaterThan(shape.tip.x);
		expect(shape.tail.y).toBeGreaterThan(shape.tip.y);
		expect(Math.hypot(shape.tip.x - shape.base.x, shape.tip.y - shape.base.y)).toBeCloseTo(18);
	});

	it("an arrow at the lower right corner points in from the other side", () => {
		const shape = pointerShape({ kind: "ARROW", x: 1, y: 1 }, picture, 4);
		if (shape.kind !== "ARROW") throw new Error("not an arrow");
		expect(shape.tail.x).toBeLessThan(shape.tip.x);
		expect(shape.tail.y).toBeLessThan(shape.tip.y);
	});
});
