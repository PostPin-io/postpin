<script lang="ts">
	import MarkerCard from "./MarkerCard.svelte";
	import MarkerPositionModal from "./MarkerPositionModal.svelte";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import type { ReviewMarker } from "./types";

	interface Props {
		/** The marker being edited; undefined closes the modal, also once the marker is deleted */
		marker: ReviewMarker | undefined;
		/** Neighbors in the list, shown as full cards while swiping; undefined at the ends */
		previous: ReviewMarker | undefined;
		next: ReviewMarker | undefined;
		/** Playhead, offered as the new position */
		currentFrame: number;
		/** Timeline length in frames */
		frameCount: number;
		startFrame: number;
		frameRate: FrameRate;
		onclose: () => void;
		/** Swipe left/right: -1 for the previous marker, 1 for the next one */
		onnavigate: (direction: -1 | 1) => void;
	}
	let {
		marker,
		previous,
		next,
		currentFrame,
		frameCount,
		startFrame,
		frameRate,
		onclose,
		onnavigate,
	}: Props = $props();
	let positionModal: MarkerPositionModal | null = $state(null);

	// One component per marker id. The keyed #each below moves a card from "next" to "current"
	// instead of rebuilding it, so what slid in is exactly what stays
	const cards: Record<string, MarkerCard | null> = {};

	type Slot = { marker: ReviewMarker; offset: -1 | 0 | 1 };
	const slots = $derived.by(() => {
		if (!marker) return [];
		const list: Slot[] = [];
		if (previous) list.push({ marker: previous, offset: -1 });
		list.push({ marker, offset: 0 });
		if (next) list.push({ marker: next, offset: 1 });
		return list;
	});

	let dialog: HTMLDialogElement | null = $state(null);
	$effect(() => {
		if (!dialog) return;
		if (marker && !dialog.open) dialog.showModal();
		else if (!marker && dialog.open) dialog.close();
	});

	// ── Swipe: cards side by side, the finger drags them 1:1 ──
	const GAP = 12; // px between two cards
	const SNAP_MS = 220; // must match duration-220 on the cards
	const CLOSE_DISTANCE = 60; // swipe down from the top this far to close
	const NAVIGATE_SHARE = 0.25; // or drag a quarter of the width…
	const FLICK_SPEED = 0.5; // …or flick faster than this (px/ms)

	let track: HTMLElement | null = $state(null);
	let trackWidth = $state(0);
	let dragX = $state(0);
	let dragY = $state(0);
	let snapping = $state(false);
	let gesture: {
		x: number;
		y: number;
		time: number;
		fromTop: boolean;
		axis: "x" | "y" | null;
	} | null = null;

	function onTouchStart(event: TouchEvent) {
		const target = event.target as HTMLElement;
		const touch = event.touches[0];
		gesture =
			!snapping && event.touches.length === 1 && !target.closest("textarea, input")
				? {
						x: touch.clientX,
						y: touch.clientY,
						time: event.timeStamp,
						fromTop: (target.closest("[data-scroller]")?.scrollTop ?? 0) <= 0,
						axis: null,
					}
				: null;
	}

	function onTouchMove(event: TouchEvent) {
		if (!gesture) return;
		const touch = event.touches[0];
		const dx = touch.clientX - gesture.x;
		const dy = touch.clientY - gesture.y;
		// Decide once per gesture, so a sideways swipe never scrolls and a scroll never swipes
		if (!gesture.axis) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
			gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
		}
		if (gesture.axis === "x") {
			if (event.cancelable) event.preventDefault();
			// Rubber band at the first and last marker
			const blocked = (dx < 0 && !next) || (dx > 0 && !previous);
			dragX = blocked ? dx * 0.25 : dx;
		} else if (gesture.fromTop && dy > 0) {
			// Keeps the browser's pull-to-refresh from taking over the same gesture
			if (event.cancelable) event.preventDefault();
			dragY = dy;
		}
	}

	function onTouchEnd(event: TouchEvent) {
		const g = gesture;
		gesture = null;
		if (!g) return;

		if (dragY) {
			const shouldClose = dragY >= CLOSE_DISTANCE && event.type === "touchend";
			dragY = 0;
			if (shouldClose) dialog?.close();
			return;
		}
		if (g.axis !== "x") return;

		const speed = dragX / Math.max(event.timeStamp - g.time, 1);
		const far = Math.abs(dragX) >= trackWidth * NAVIGATE_SHARE || Math.abs(speed) >= FLICK_SPEED;
		let direction: -1 | 0 | 1 = 0;
		if (event.type === "touchend" && far) {
			if (dragX < 0 && next) direction = 1;
			if (dragX > 0 && previous) direction = -1;
		}

		// Let the cards glide to their end position, then swap the marker
		snapping = true;
		dragX = direction === 0 ? 0 : -direction * (trackWidth + GAP);
		setTimeout(() => {
			if (direction !== 0) onnavigate(direction);
			// Same tick as the marker swap: the new current card sits at 0 without a jump
			snapping = false;
			dragX = 0;
		}, SNAP_MS);
	}

	// Svelte's touch handlers are passive, so preventDefault needs manual listeners
	$effect(() => {
		if (!track) return;
		const el = track;
		el.addEventListener("touchstart", onTouchStart, { passive: true });
		el.addEventListener("touchmove", onTouchMove, { passive: false });
		el.addEventListener("touchend", onTouchEnd);
		el.addEventListener("touchcancel", onTouchEnd);
		return () => {
			el.removeEventListener("touchstart", onTouchStart);
			el.removeEventListener("touchmove", onTouchMove);
			el.removeEventListener("touchend", onTouchEnd);
			el.removeEventListener("touchcancel", onTouchEnd);
		};
	});

	// 0 at rest, 1 once a neighbor has fully slid in
	const progress = $derived(trackWidth ? Math.min(Math.abs(dragX) / (trackWidth + GAP), 1) : 0);

	/** The category color as the card frame; strength 0–100 fades it towards transparent */
	function frameColor(color: string, strength: number) {
		return `color-mix(in oklab, ${color} ${Math.round(strength)}%, transparent)`;
	}

	/** offset -1 = previous card, 0 = current, 1 = next */
	function cardTransform(offset: -1 | 0 | 1) {
		return `translate3d(calc(${offset * 100}% + ${offset * GAP + dragX}px), 0, 0)`;
	}

	// The card leaving fades out, the card coming in fades in
	const FADED = 25;
	const currentStrength = $derived(100 - progress * (100 - FADED));
	const incomingStrength = $derived(FADED + progress * (100 - FADED));

	function strength(offset: -1 | 0 | 1) {
		if (offset === 0) return currentStrength;
		// Only the neighbor on the side being swiped towards comes in
		return (offset === 1 && dragX < 0) || (offset === -1 && dragX > 0) ? incomingStrength : FADED;
	}
</script>

<!-- Fullscreen on the phone: the editor, the conversation and the reply field in one place -->
<dialog bind:this={dialog} class="modal" {onclose}>
	<div
		class="fixed inset-0 bg-base-300 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
	>
		<div
			bind:this={track}
			bind:clientWidth={trackWidth}
			class="relative h-full overflow-hidden overscroll-contain {dragY
				? ''
				: 'transition-transform'}"
			style:transform={dragY ? `translateY(${dragY}px)` : undefined}
		>
			{#each slots as slot (slot.marker.id)}
				<!-- Neighbors are the same full card, inert: visible, but only the current one reacts -->
				<div
					class="absolute inset-0 flex flex-col overflow-hidden rounded-box border-[3px] bg-base-100 {snapping
						? 'transition-[transform,border-color] duration-220 ease-out'
						: ''}"
					style:border-color={frameColor(slot.marker.category.color, strength(slot.offset))}
					style:transform={cardTransform(slot.offset)}
					inert={slot.offset !== 0}
				>
					<MarkerCard
						bind:this={cards[slot.marker.id]}
						marker={slot.marker}
						{startFrame}
						{frameRate}
						{frameCount}
						onclose={() => dialog?.close()}
						onchangeposition={() => positionModal?.open(slot.marker.frame)}
					/>
				</div>
			{/each}
		</div>
	</div>

	<!-- Outside the track, so touches in it never start a swipe -->
	<MarkerPositionModal
		bind:this={positionModal}
		{currentFrame}
		{startFrame}
		{frameRate}
		{frameCount}
		onsave={(frame) => {
			if (marker) cards[marker.id]?.moveTo(frame);
		}}
	/>
</dialog>
