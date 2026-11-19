<script lang="ts">
	import {
		arrowTail,
		boxFromCorners,
		fromPicture,
		isClick,
		isUsableBox,
		movePointer,
		pictureBox,
		resizeBox,
		toPicture,
		type Box,
		type Corner,
		type PointerGeometry,
		type Point,
		type Size,
	} from "@postpin-io/shared/logic/pointers";
	import { isTypingTarget } from "#lib/keyboard.ts";
	import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
	import MoveUpLeft from "@lucide/svelte/icons/move-up-left";
	import Move from "@lucide/svelte/icons/move";
	import Square from "@lucide/svelte/icons/square";
	import { contrastColor } from "../categories/category-color.ts";
	import { usePointerSession } from "./markers/pointer-session.svelte.ts";
	import {
		addPointer,
		changePointer,
		geometryOf,
		removePointer,
		type PointerScope,
	} from "./markers/pointer-actions.ts";
	import type { ReviewMarker } from "./markers/types.ts";

	interface Props {
		/** Selected markers the playhead is on: their pointers are drawn */
		markers: ReviewMarker[];
		scope: PointerScope;
		/** Intrinsic size of the video, to find the picture inside the letterbox */
		videoSize?: Size;
	}
	let { markers, scope, videoSize }: Props = $props();

	const session = usePointerSession();

	let width = $state(0);
	let height = $state(0);
	const picture = $derived(pictureBox({ width, height }, videoSize ?? { width: 0, height: 0 }));

	const drawingMarker = $derived(
		markers.find((m) => m.id === session?.drawingMarkerId && m.canUpdate),
	);

	const pointers = $derived(
		markers.flatMap((marker) => marker.pointers.map((pointer) => ({ marker, pointer }))),
	);

	// A pointer that went away (other marker, other frame, deleted) can't stay selected
	$effect(() => {
		if (session?.selectedId && !pointers.some((p) => p.pointer.id === session.selectedId)) {
			session.selectedId = null;
		}
	});

	// An outline in the opposite brightness keeps dark and light colors readable on any footage
	const haloOf = (color: string) =>
		contrastColor(color) === "#ffffff" ? "rgb(255 255 255 / 0.7)" : "rgb(0 0 0 / 0.55)";

	// ─── Sizes: scale with the picture, like the pointers themselves ───
	const stroke = $derived(Math.max(2, picture.height * 0.004));
	const radius = $derived(Math.min(12, picture.height * 0.012));
	const handle = 10;

	// ─── Dragging: a pointer being drawn, moved or resized ───
	type Drag =
		| { kind: "draw"; from: Point; to: Point }
		| { kind: "move"; id: string; markerId: string; from: Point; start: PointerGeometry }
		| {
				kind: "resize";
				id: string;
				markerId: string;
				corner: Corner;
				start: Box & { kind: "RECT" };
		  };
	let drag = $state<Drag | null>(null);
	/** The geometry a moved or resized pointer has right now, before it's saved */
	let draft = $state<{ id: string; geometry: PointerGeometry } | null>(null);
	let busy = false;

	function local(event: PointerEvent): Point {
		const rect = overlay!.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}
	let overlay = $state<HTMLElement>();

	const onPicture = (p: Point) =>
		p.x >= picture.x &&
		p.x <= picture.x + picture.width &&
		p.y >= picture.y &&
		p.y <= picture.y + picture.height;

	function startDraw(event: PointerEvent) {
		if (event.button !== 0 || !drawingMarker) return;
		const from = local(event);
		if (!onPicture(from)) return;
		event.preventDefault();
		overlay!.setPointerCapture(event.pointerId);
		drag = { kind: "draw", from, to: from };
	}

	function startMove(
		event: PointerEvent,
		marker: ReviewMarker,
		geometry: PointerGeometry,
		id: string,
	) {
		if (session) session.selectedId = id;
		if (event.button !== 0 || !marker.canUpdate || session?.drawingMarkerId) return;
		event.stopPropagation();
		event.preventDefault();
		// On the pointer itself: the overlay ignores the mouse outside drawing mode. The moves bubble up.
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		drag = { kind: "move", id, markerId: marker.id, from: local(event), start: geometry };
	}

	function startResize(
		event: PointerEvent,
		markerId: string,
		id: string,
		start: Box,
		corner: Corner,
	) {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.preventDefault();
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		drag = { kind: "resize", id, markerId, corner, start: { kind: "RECT", ...start } };
	}

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const at = local(event);
		if (drag.kind === "draw") {
			drag.to = at;
		} else if (drag.kind === "move") {
			if (isClick(drag.from, at) && !draft) return;
			draft = {
				id: drag.id,
				geometry: movePointer(
					drag.start,
					(at.x - drag.from.x) / picture.width,
					(at.y - drag.from.y) / picture.height,
				),
			};
		} else {
			draft = {
				id: drag.id,
				geometry: { kind: "RECT", ...resizeBox(drag.start, drag.corner, toPicture(at, picture)) },
			};
		}
	}

	async function endDrag(event: PointerEvent) {
		const done = drag;
		drag = null;
		if (!done) return;

		if (done.kind === "draw") {
			const marker = drawingMarker;
			if (!marker || busy) return;
			const geometry: PointerGeometry | null = isClick(done.from, done.to)
				? { kind: "ARROW", ...toPicture(done.from, picture) }
				: boxGeometry(done.from, done.to);
			if (!geometry) return;
			// Shift keeps drawing, for several pointers in a row
			if (!event.shiftKey) session?.stopDrawing();
			busy = true;
			try {
				const created = await addPointer(scope, marker.id, geometry);
				if (session) session.selectedId = created.id;
			} finally {
				busy = false;
			}
			return;
		}

		const moved = draft;
		if (!moved || moved.id !== done.id) return;
		try {
			await changePointer(scope, done.markerId, done.id, { geometry: moved.geometry });
		} finally {
			if (draft?.id === moved.id) draft = null;
		}
	}

	function boxGeometry(from: Point, to: Point): PointerGeometry | null {
		const box = boxFromCorners(toPicture(from, picture), toPicture(to, picture));
		return isUsableBox(box) ? { kind: "RECT", ...box } : null;
	}

	function cancelDrag() {
		drag = null;
		draft = null;
	}

	// ─── Keyboard: Escape leaves drawing / the selection, Delete removes the selected pointer ───
	// Capture phase: the marker panel would otherwise deselect the whole marker on Escape
	function onKeyDown(event: KeyboardEvent) {
		if (!session || isTypingTarget(event)) return;
		if (event.key === "Escape" && (session.drawingMarkerId || session.selectedId || drag)) {
			event.stopImmediatePropagation();
			event.preventDefault();
			if (drag) cancelDrag();
			else if (session.drawingMarkerId) session.stopDrawing();
			else session.selectedId = null;
			return;
		}
		if (
			(event.key === "Delete" || event.key === "Backspace") &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			session.selectedId
		) {
			const selected = pointers.find((p) => p.pointer.id === session.selectedId);
			if (!selected?.marker.canUpdate) return;
			event.stopImmediatePropagation();
			event.preventDefault();
			session.selectedId = null;
			void removePointer(scope, selected.marker.id, selected.pointer.id);
		}
	}

	// A click anywhere else (video, panels) drops the selection; the pointer list keeps it
	function onWindowPointerDown(event: PointerEvent) {
		if (!session?.selectedId) return;
		const target = event.target;
		if (target instanceof Element && target.closest("[data-pointer-ui]")) return;
		session.selectedId = null;
	}

	// ─── Geometry in overlay pixels ───
	function shapeOf(geometry: PointerGeometry) {
		if (geometry.kind === "RECT") {
			const topLeft = fromPicture(geometry, picture);
			return {
				kind: "RECT" as const,
				x: topLeft.x,
				y: topLeft.y,
				width: geometry.width * picture.width,
				height: geometry.height * picture.height,
			};
		}
		const tip = fromPicture(geometry, picture);
		const tail = fromPicture(arrowTail(geometry, picture), picture);
		// Arrowhead: a triangle at the tip, the line stops at its base so the tip stays sharp
		const length = Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1;
		const ux = (tip.x - tail.x) / length;
		const uy = (tip.y - tail.y) / length;
		const head = stroke * 4.5;
		const half = stroke * 2.6;
		const base = { x: tip.x - ux * head, y: tip.y - uy * head };
		return {
			kind: "ARROW" as const,
			tip,
			tail,
			base,
			head: `${tip.x},${tip.y} ${base.x - uy * half},${base.y + ux * half} ${base.x + uy * half},${base.y - ux * half}`,
		};
	}

	const drawPreview = $derived.by(() => {
		if (drag?.kind !== "draw" || isClick(drag.from, drag.to)) return null;
		return boxGeometry(drag.from, drag.to);
	});

	const corners: { corner: Corner; cursor: string; at: (b: Box) => Point }[] = [
		{ corner: "nw", cursor: "nwse-resize", at: (b) => ({ x: b.x, y: b.y }) },
		{ corner: "ne", cursor: "nesw-resize", at: (b) => ({ x: b.x + b.width, y: b.y }) },
		{ corner: "sw", cursor: "nesw-resize", at: (b) => ({ x: b.x, y: b.y + b.height }) },
		{ corner: "se", cursor: "nwse-resize", at: (b) => ({ x: b.x + b.width, y: b.y + b.height }) },
	];
</script>

<svelte:window onkeydowncapture={onKeyDown} onpointerdowncapture={onWindowPointerDown} />

<!-- In drawing mode the overlay takes every click on the picture, otherwise only the pointers do,
and a click on the video still plays and pauses -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={overlay}
	bind:clientWidth={width}
	bind:clientHeight={height}
	class="absolute inset-0 z-[5] touch-none select-none"
	class:pointer-events-none={!drawingMarker && !drag}
	class:cursor-crosshair={!!drawingMarker}
	data-pointer-ui
	onpointerdown={startDraw}
	onpointermove={moveDrag}
	onpointerup={endDrag}
	onpointercancel={cancelDrag}
>
	{#if pointers.length > 0 || drawPreview}
		<svg class="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
			{#each pointers as { marker, pointer } (pointer.id)}
				{@const geometry = draft?.id === pointer.id ? draft.geometry : geometryOf(pointer)}
				{@const shape = shapeOf(geometry)}
				{@const highlighted = session?.highlightedId === pointer.id}
				{@const selected = session?.selectedId === pointer.id}
				{@const halo = haloOf(pointer.color)}
				{@const lineWidth = stroke * (highlighted || selected ? 1.8 : 1)}
				{@const editable = marker.canUpdate && !drawingMarker}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g
					class:cursor-move={editable}
					onpointerdown={(event) => startMove(event, marker, geometry, pointer.id)}
				>
					{#if shape.kind === "RECT"}
						<!-- The outline keeps the color readable on any footage -->
						<rect
							x={shape.x}
							y={shape.y}
							width={shape.width}
							height={shape.height}
							rx={radius}
							fill="none"
							stroke={halo}
							stroke-width={lineWidth + 2}
						/>
						<rect
							x={shape.x}
							y={shape.y}
							width={shape.width}
							height={shape.height}
							rx={radius}
							fill="none"
							stroke={pointer.color}
							stroke-width={lineWidth}
						/>
						<!-- Grabbed at the frame only: a click inside the box still reaches the video -->
						<rect
							x={shape.x}
							y={shape.y}
							width={shape.width}
							height={shape.height}
							rx={radius}
							fill="none"
							stroke="transparent"
							stroke-width={Math.max(14, lineWidth * 4)}
							pointer-events={editable ? "stroke" : "none"}
						/>
					{:else}
						<line
							x1={shape.tail.x}
							y1={shape.tail.y}
							x2={shape.base.x}
							y2={shape.base.y}
							stroke={halo}
							stroke-width={lineWidth + 2}
							stroke-linecap="round"
						/>
						<polygon
							points={shape.head}
							fill={halo}
							stroke={halo}
							stroke-width={2}
							stroke-linejoin="round"
						/>
						<line
							x1={shape.tail.x}
							y1={shape.tail.y}
							x2={shape.base.x}
							y2={shape.base.y}
							stroke={pointer.color}
							stroke-width={lineWidth}
							stroke-linecap="round"
						/>
						<polygon points={shape.head} fill={pointer.color} />
						<line
							x1={shape.tail.x}
							y1={shape.tail.y}
							x2={shape.tip.x}
							y2={shape.tip.y}
							stroke="transparent"
							stroke-width={Math.max(16, lineWidth * 5)}
							pointer-events={editable ? "stroke" : "none"}
						/>
					{/if}
				</g>
				{#if selected && editable && shape.kind === "RECT"}
					{#each corners as { corner, cursor, at } (corner)}
						{@const p = at(shape)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<rect
							x={p.x - handle / 2}
							y={p.y - handle / 2}
							width={handle}
							height={handle}
							rx={2}
							fill="white"
							stroke="rgb(0 0 0 / 0.7)"
							stroke-width={1.5}
							pointer-events="all"
							style:cursor
							onpointerdown={(event) =>
								startResize(event, marker.id, pointer.id, geometry as Box, corner)}
						/>
					{/each}
				{/if}
			{/each}

			{#if drawPreview?.kind === "RECT"}
				{@const shape = shapeOf(drawPreview)}
				{#if shape.kind === "RECT"}
					<rect
						x={shape.x}
						y={shape.y}
						width={shape.width}
						height={shape.height}
						rx={radius}
						fill="none"
						stroke="rgb(0 0 0 / 0.55)"
						stroke-width={stroke + 2}
					/>
					<rect
						x={shape.x}
						y={shape.y}
						width={shape.width}
						height={shape.height}
						rx={radius}
						fill="none"
						stroke="#CE272D"
						stroke-width={stroke}
						stroke-dasharray="{stroke * 3} {stroke * 2}"
					/>
				{/if}
			{/if}
		</svg>
	{/if}
	{#if drawingMarker}
		<div
			class="pointer-events-none absolute top-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-box bg-base-100/90 px-4 py-2 text-sm shadow"
			role="status"
		>
			<span class="flex items-center gap-1.5 whitespace-nowrap">
				<MousePointerClick size={16} /> Click
				<MoveUpLeft size={16} class="text-base-content/70" /> arrow
			</span>
			<span class="flex items-center gap-1.5 whitespace-nowrap">
				<Move size={16} /> Drag
				<Square size={16} class="text-base-content/70" /> box
			</span>
			<span class="flex items-center gap-1.5 whitespace-nowrap">
				<kbd class="kbd kbd-sm">Shift</kbd> add more
			</span>
			<span class="flex items-center gap-1.5 whitespace-nowrap">
				<kbd class="kbd kbd-sm">Esc</kbd> stop
			</span>
		</div>
	{/if}
</div>
