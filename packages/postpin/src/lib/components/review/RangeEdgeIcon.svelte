<!-- A squashed play triangle for a range's start or end: its flat side sits on the edge, its tip
points into the range. Start and end are mirror images, so neither looks like the "real" marker.
Drawn like Lucide's diamond next to it: same 24 unit grid, corner radius and stroke scaling. -->
<script lang="ts">
	interface Props {
		edge: "start" | "end";
		size?: number;
		fill: string;
		stroke?: string;
		strokeWidth?: number;
	}

	let { edge, size = 16, fill, stroke = "rgb(0 0 0 / 0.4)", strokeWidth = 1.5 }: Props = $props();

	// Lucide's diamond rounds its corners with this radius. Its corners would meet at y 1 and 23 of
	// 24 units, so rounded it reaches from TOP to 24 - TOP.
	const RADIUS = 2.41;
	const TOP = 1 + RADIUS * (Math.SQRT2 - 1);
	// The triangle has the diamond's angles: a 90° tip and 45° corners. Rounding a 45° corner cuts
	// off more than a 90° one, so the corners reach further out to end as high as the diamond.
	const HALF_HEIGHT = 12 - TOP + (RADIUS * (1 + Math.SQRT2)) / Math.SQRT2;
	// The rounded tip falls short of its corner like the diamond's
	const TIP = HALF_HEIGHT - RADIUS * (Math.SQRT2 - 1);

	type Point = [number, number];

	// A polygon with every corner rounded by the same radius, like the diamond's
	function roundedPath(points: Point[], radius: number) {
		const corners = points.map((point, i) => {
			const prev = points[(i + points.length - 1) % points.length];
			const next = points[(i + 1) % points.length];
			const toPrev = unit(prev, point);
			const toNext = unit(next, point);
			const angle = Math.acos(toPrev[0] * toNext[0] + toPrev[1] * toNext[1]);
			const cut = radius / Math.tan(angle / 2);
			return {
				from: [point[0] + toPrev[0] * cut, point[1] + toPrev[1] * cut],
				to: [point[0] + toNext[0] * cut, point[1] + toNext[1] * cut],
			};
		});
		const n = (value: number) => +value.toFixed(3);
		return (
			corners
				.map(
					({ from, to }, i) =>
						`${i === 0 ? "M" : "L"} ${n(from[0])} ${n(from[1])} A ${radius} ${radius} 0 0 1 ${n(to[0])} ${n(to[1])}`,
				)
				.join(" ") + " Z"
		);
	}

	function unit([x, y]: Point, [fromX, fromY]: Point): Point {
		const length = Math.hypot(x - fromX, y - fromY);
		return [(x - fromX) / length, (y - fromY) / length];
	}

	// The stroke's outer side lies on the flat edge and on the tip
	const viewWidth = $derived(TIP + strokeWidth);
	const path = $derived.by(() => {
		const flat = strokeWidth / 2;
		return roundedPath(
			[
				[flat, 12 - HALF_HEIGHT],
				[flat + HALF_HEIGHT, 12],
				[flat, 12 + HALF_HEIGHT],
			],
			RADIUS,
		);
	});
</script>

<svg
	width={(size * viewWidth) / 24}
	height={size}
	viewBox="0 0 {viewWidth} 24"
	class="block"
	style={edge === "end" ? "transform: scaleX(-1)" : undefined}
	aria-hidden="true"
>
	<path d={path} {fill} {stroke} stroke-width={strokeWidth} stroke-linejoin="round" />
</svg>
