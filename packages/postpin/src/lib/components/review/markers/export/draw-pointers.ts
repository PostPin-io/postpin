import {
	pointerRadius,
	pointerShape,
	pointerStroke,
	type Size,
} from "@postpin-io/shared/logic/pointers";
import { geometryOf } from "../pointer-actions.ts";
import { haloOf } from "../pointer-style.ts";
import type { ReviewPointer } from "../types.ts";

/** Draws pointers on a canvas that holds just the frame, the way PointerOverlay shows them */
export function drawPointers(ctx: CanvasRenderingContext2D, pointers: ReviewPointer[], size: Size) {
	const picture = { x: 0, y: 0, ...size };
	const stroke = pointerStroke(size.height);
	const radius = pointerRadius(size.height);
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (const pointer of pointers) {
		const shape = pointerShape(geometryOf(pointer), picture, stroke);
		const halo = haloOf(pointer.color);
		// The halo first, the color on top: keeps it readable on any footage
		for (const [color, width] of [
			[halo, stroke + 2],
			[pointer.color, stroke],
		] as const) {
			ctx.strokeStyle = color;
			ctx.fillStyle = color;
			ctx.lineWidth = width;
			ctx.beginPath();
			if (shape.kind === "RECT") {
				ctx.roundRect(shape.x, shape.y, shape.width, shape.height, radius);
				ctx.stroke();
				continue;
			}
			ctx.moveTo(shape.tail.x, shape.tail.y);
			ctx.lineTo(shape.base.x, shape.base.y);
			ctx.stroke();

			const [tip, left, right] = shape.head;
			ctx.beginPath();
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(left.x, left.y);
			ctx.lineTo(right.x, right.y);
			ctx.closePath();
			ctx.fill();
			if (color === halo) {
				ctx.lineWidth = 2;
				ctx.stroke();
			}
		}
	}
	ctx.restore();
}
