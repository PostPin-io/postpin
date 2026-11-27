<script lang="ts">
	import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";
	import MovieBarcodeStrip from "./MovieBarcode.svelte";

	interface Props {
		/** Background; a plain bar while it isn't made yet */
		barcode: MovieBarcode | null | undefined;
		/** The part in view, as fractions of the whole export */
		start: number;
		width: number;
		/** Playhead, as a fraction of the whole export */
		position: number;
		/** The window was dragged (or a click beside it centered it) to this start */
		onpan: (start: number) => void;
		/** Scrolling over the overview, in fractions of the export */
		onscroll?: (delta: number) => void;
		/** An edge of the window was dragged: the other edge stays where it was */
		onresize?: (edge: Edge, start: number, width: number) => void;
		/** Parts to pick out (e.g. the shots a search found), in fractions; the rest fades */
		highlights?: Span[] | null;
	}

	type Span = { start: number; width: number };

	type Edge = "start" | "end";

	let { barcode, start, width, position, onpan, onscroll, onresize, highlights }: Props = $props();

	/** Everything between the highlights, faded so the highlighted parts stand out */
	const gaps = $derived.by(() => {
		if (!highlights) return [];
		const sorted = highlights.toSorted((a, b) => a.start - b.start);
		const result: Span[] = [];
		let from = 0;
		for (const span of sorted) {
			if (span.start > from) result.push({ start: from, width: span.start - from });
			from = Math.max(from, span.start + span.width);
		}
		if (from < 1) result.push({ start: from, width: 1 - from });
		return result;
	});

	// Pixels around an edge of the window that grab the edge instead of the window
	const EDGE_GRAB = 6;
	const MIN_WIDTH = 0.01;

	let overview = $state<HTMLDivElement>();
	let drag = $state<{ mode: "move" | Edge; pointerX: number; start: number; width: number } | null>(
		null,
	);
	let hoverEdge = $state<Edge | null>(null);
	// While an edge is dragged the frame follows the pointer; the view behind it changes in steps
	// (whole columns), so it only takes over again on release
	let resizing = $state<{ start: number; width: number } | null>(null);
	const shown = $derived(resizing ?? { start, width });

	function endDrag() {
		drag = null;
		resizing = null;
	}

	function edgeAt(clientX: number): Edge | null {
		if (!onresize || !overview) return null;
		const x = clientX - overview.getBoundingClientRect().left;
		const px = overview.clientWidth;
		if (Math.abs(x - start * px) <= EDGE_GRAB) return "start";
		if (Math.abs(x - (start + width) * px) <= EDGE_GRAB) return "end";
		return null;
	}

	const clampStart = (value: number) => Math.min(Math.max(value, 0), Math.max(1 - width, 0));

	function fraction(clientX: number) {
		const rect = overview?.getBoundingClientRect();
		return rect && rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
	}

	function startDrag(event: PointerEvent) {
		if (event.button !== 0) return;
		const edge = edgeAt(event.clientX);
		if (edge) {
			overview?.setPointerCapture(event.pointerId);
			drag = { mode: edge, pointerX: event.clientX, start, width };
			return;
		}
		const pointer = fraction(event.clientX);
		const inWindow = pointer >= start && pointer <= start + width;
		// A click beside the window centers it there and goes on as a drag
		const next = inWindow ? start : clampStart(pointer - width / 2);
		if (!inWindow) onpan(next);
		overview?.setPointerCapture(event.pointerId);
		drag = { mode: "move", pointerX: event.clientX, start: next, width };
	}

	function moveDrag(event: PointerEvent) {
		if (!drag) hoverEdge = edgeAt(event.clientX);
		if (!drag || !overview) return;
		const delta = (event.clientX - drag.pointerX) / overview.clientWidth;
		if (drag.mode === "move") {
			onpan(clampStart(drag.start + delta));
		} else if (drag.mode === "start") {
			const end = drag.start + drag.width;
			const next = Math.min(Math.max(drag.start + delta, 0), end - MIN_WIDTH);
			resizing = { start: next, width: end - next };
			onresize?.("start", next, end - next);
		} else {
			const end = Math.min(Math.max(drag.start + drag.width + delta, drag.start + MIN_WIDTH), 1);
			resizing = { start: drag.start, width: end - drag.start };
			onresize?.("end", drag.start, end - drag.start);
		}
	}

	function onwheel(event: WheelEvent) {
		if (!onscroll || !overview) return;
		event.preventDefault();
		onscroll((event.deltaX || event.deltaY) / overview.clientWidth);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={overview}
	class="relative h-7 shrink-0 touch-none overflow-hidden py-1 select-none {hoverEdge ||
	(drag && drag.mode !== 'move')
		? 'cursor-ew-resize'
		: 'cursor-pointer'}"
	data-guide="timeline-view/barcode"
	title={onresize
		? "The whole export: drag the frame to move, drag its edges to show more or less"
		: "The whole export: drag the frame to move"}
	onpointerdown={startDrag}
	onpointerleave={() => (hoverEdge = null)}
	onpointermove={moveDrag}
	onpointerup={endDrag}
	onpointercancel={endDrag}
	{onwheel}
>
	{#if barcode}
		<MovieBarcodeStrip data={barcode} class="h-full rounded-sm" />
	{:else}
		<div class="h-full rounded-sm bg-base-300"></div>
	{/if}
	{#each gaps as gap, i (i)}
		<div
			class="pointer-events-none absolute inset-y-1 bg-base-100/90"
			style="left: {gap.start * 100}%; width: {gap.width * 100}%"
		></div>
	{/each}
	<!-- A box around each highlight, at least a few pixels wide, so even a one-frame shot stays findable -->
	{#each highlights ?? [] as span, i (i)}
		<div
			class="pointer-events-none absolute inset-y-0 min-w-1 rounded-sm border-2 border-primary shadow-[0_0_6px_var(--color-primary)]"
			style="left: {span.start * 100}%; width: {span.width * 100}%"
		></div>
	{/each}
	<div
		class="pointer-events-none absolute inset-y-0 w-px bg-error"
		style="left: {position * 100}%"
	></div>
	<!-- The part in view; the shadow dims everything beside it -->
	<div
		class="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-base-content/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
		style="left: {shown.start * 100}%; width: {shown.width * 100}%"
	></div>
</div>
