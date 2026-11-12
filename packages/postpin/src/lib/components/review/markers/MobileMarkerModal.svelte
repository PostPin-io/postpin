<script lang="ts">
	import CategoryBadge from "../../categories/CategoryBadge.svelte";

	import X from "@lucide/svelte/icons/x";
	import Send from "@lucide/svelte/icons/send";
	import LocateFixed from "@lucide/svelte/icons/locate-fixed";
	import Trash from "@lucide/svelte/icons/trash";
	import UpdateMarker from "./UpdateMarker.svelte";
	import { createResponse, getResponses } from "./markers.remote";
	import { useShare } from "../share-context.ts";
	import { formatTimecode } from "@postpin-io/shared/logic/timecode";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import type { ReviewMarker } from "./types";

	interface Props {
		/** The marker being edited; undefined closes the modal, also once the marker is deleted */
		marker: ReviewMarker | undefined;
		/** Neighbors in the list, shown as cards while swiping; undefined at the ends */
		previous: ReviewMarker | undefined;
		next: ReviewMarker | undefined;

		startFrame: number;
		frameRate: FrameRate;
		onclose: () => void;
		onseek: (frame: number) => void;
		/** Swipe left/right: -1 for the previous marker, 1 for the next one */
		onnavigate: (direction: -1 | 1) => void;
	}
	let { marker, previous, next, startFrame, frameRate, onclose, onseek, onnavigate }: Props =
		$props();

	let updateMarkerComponent: UpdateMarker | null = $state(null);
	let deleting = $state(false);

	const getShare = useShare();
	const share = $derived(getShare());

	let dialog: HTMLDialogElement | null = $state(null);
	$effect(() => {
		if (!dialog) return;
		if (marker && !dialog.open) dialog.showModal();
		else if (!marker && dialog.open) dialog.close();
	});

	// Guests have no conversations
	const responses = $derived(marker && !share ? await getResponses(marker.id) : []);

	let reply = $state("");
	let sending = $state(false);
	// A draft belongs to one marker
	$effect(() => {
		void marker?.id;
		reply = "";
	});

	async function send() {
		const content = reply.trim();
		if (!marker || !content || sending) return;
		sending = true;
		try {
			await createResponse({ markerId: marker.id, content });
			reply = "";
		} finally {
			sending = false;
		}
	}

	async function deleteCurrentMarker() {
		if (!updateMarkerComponent || deleting) return;
		deleting = true;
		try {
			await updateMarkerComponent.remove();
		} finally {
			deleting = false;
		}
	}

	// ── Swipe: cards side by side, the finger drags them 1:1 ──
	const GAP = 12; // px between two cards
	const SNAP_MS = 220; // must match duration-220 on the cards
	const CLOSE_DISTANCE = 60; // swipe down from the top this far to close
	const NAVIGATE_SHARE = 0.25; // or drag a quarter of the width…
	const FLICK_SPEED = 0.5; // …or flick faster than this (px/ms)

	let scroller: HTMLElement | null = $state(null);
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
						fromTop: (scroller?.scrollTop ?? 0) <= 0,
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
	const previousStrength = $derived(dragX > 0 ? incomingStrength : FADED);
	const nextStrength = $derived(dragX < 0 ? incomingStrength : FADED);

	const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
</script>

{#snippet previewCard(neighbor: ReviewMarker, offset: -1 | 1, strength: number)}
	<!-- Read-only preview: only the current card is interactive -->
	<div
		class="pointer-events-none absolute inset-0 flex flex-col overflow-hidden rounded-box border-[3px] bg-base-100 {snapping
			? 'transition-[transform,border-color] duration-220 ease-out'
			: ''}"
		style:border-color={frameColor(neighbor.category.color, strength)}
		style:transform={cardTransform(offset)}
		aria-hidden="true"
	>
		<header class="flex min-h-14 shrink-0 items-center border-b border-base-300 px-2 py-2">
			<h2 class="min-w-0 flex-1 truncate text-center text-lg font-semibold">
				{neighbor.name?.trim() || "Marker"}
			</h2>
		</header>
		<div class="flex flex-col gap-3 p-4">
			<div class="flex items-center gap-2">
				<span class="font-mono">{formatTimecode(neighbor.frame, frameRate)}</span>
				<CategoryBadge category={neighbor.category} class="px-3 badge-md font-semibold" />
			</div>
			{#if neighbor.description}
				<p class="line-clamp-6 whitespace-pre-wrap text-base-content/80">
					{neighbor.description}
				</p>
			{/if}
		</div>
	</div>
{/snippet}

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
			{#if marker}
				{#if previous}{@render previewCard(previous, -1, previousStrength)}{/if}
				{#if next}{@render previewCard(next, 1, nextStrength)}{/if}

				<div
					class="absolute inset-0 flex flex-col overflow-hidden rounded-box border-[3px] bg-base-100 {snapping
						? 'transition-[transform,border-color] duration-220 ease-out'
						: ''}"
					style:border-color={frameColor(marker.category.color, currentStrength)}
					style:transform={cardTransform(0)}
				>
					<header
						class="flex min-h-14 shrink-0 items-center gap-1 border-b border-base-300 px-2 py-2"
					>
						{#if marker.canDelete}
							<button
								type="button"
								class="btn btn-square btn-error"
								title="Delete marker"
								aria-label="Delete marker"
								disabled={deleting}
								onclick={() => void deleteCurrentMarker()}
							>
								<Trash size={20} />
							</button>
						{/if}
						<h2 class="min-w-0 flex-1 truncate text-center text-lg font-semibold">
							{marker.name?.trim() || "Marker"}
						</h2>
						{#if marker.canDelete}
							<span class="w-12 shrink-0" aria-hidden="true"></span>
						{/if}
					</header>

					<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						{#key marker.id}
							<UpdateMarker
								bind:this={updateMarkerComponent}
								{marker}
								{startFrame}
								mobile
								onclose={() => dialog?.close()}
							>
								{#snippet mobileHeaderAction()}
									<button
										type="button"
										class="btn btn-ghost"
										aria-label="Go to marker in the video"
										onclick={() => {
											onseek(marker!.frame);
											dialog?.close();
										}}
									>
										<LocateFixed size={20} />
										<span class="font-mono">{formatTimecode(marker!.frame, frameRate)}</span>
									</button>
								{/snippet}
							</UpdateMarker>
						{/key}

						{#if !share}
							<form
								class="flex items-end gap-2 px-4 pb-4"
								onsubmit={(event) => {
									event.preventDefault();
									void send();
								}}
							>
								<textarea
									class="textarea min-h-11 flex-1 resize-none"
									rows="1"
									placeholder="Write a response…"
									aria-label="Response"
									bind:value={reply}></textarea>
								<button
									type="submit"
									class="btn btn-square btn-primary"
									aria-label="Send response"
									disabled={sending || !reply.trim()}
								>
									{#if sending}<span class="loading loading-sm loading-spinner"></span>{:else}<Send
											size={20}
										/>{/if}
								</button>
							</form>

							<section class="flex flex-col gap-3 px-4 pb-4" aria-label="Responses">
								<h3 class="font-semibold">Responses ({responses.length})</h3>
								<!-- Newest first: right below the reply field, where a sent response shows up -->
								{#each [...responses].reverse() as response (response.id)}
									<div class="rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
										<p class="break-words whitespace-pre-wrap">{response.content}</p>
										<p class="mt-1 text-xs text-base-content/60">
											{response.author?.name ?? "Deleted User"} · {dateTimeFormat.format(
												response.createdAt,
											)}
										</p>
									</div>
								{:else}
									<p class="text-sm text-base-content/60">No responses yet.</p>
								{/each}
							</section>
						{/if}
					</div>

					<footer class="flex shrink-0 justify-end border-t border-base-300 px-3 py-2">
						<button
							type="button"
							class="btn btn-square btn-ghost"
							aria-label="Close"
							onclick={() => dialog?.close()}
						>
							<X size={22} />
						</button>
					</footer>
				</div>
			{/if}
		</div>
	</div>
</dialog>
