<script lang="ts">
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
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
		startFrame: number;
		frameRate: FrameRate;
		onclose: () => void;
		onseek: (frame: number) => void;
		/** Swipe left/right: -1 for the previous marker, 1 for the next one */
		onnavigate: (direction: -1 | 1) => void;
	}
	let { marker, startFrame, frameRate, onclose, onseek, onnavigate }: Props = $props();
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

	// Swipe down from the top of the content to close, left/right for the next/previous marker
	const CLOSE_DISTANCE = 60;
	const NAVIGATE_DISTANCE = 60;
	let scroller: HTMLElement | null = $state(null);
	let box: HTMLElement | null = $state(null);
	let dragStart: { x: number; y: number; fromTop: boolean } | null = null;
	let lastTouch = { x: 0, y: 0 };
	let dragOffset = $state(0);
	let dragX = $state(0);

	function onTouchStart(event: TouchEvent) {
		const target = event.target as HTMLElement;
		const touch = event.touches[0];
		dragStart =
			event.touches.length === 1 && !target.closest("textarea, input")
				? { x: touch.clientX, y: touch.clientY, fromTop: (scroller?.scrollTop ?? 0) <= 0 }
				: null;
		lastTouch = { x: touch.clientX, y: touch.clientY };
	}

	function onTouchMove(event: TouchEvent) {
		if (!dragStart) return;
		const touch = event.touches[0];
		lastTouch = { x: touch.clientX, y: touch.clientY };
		const dy = touch.clientY - dragStart.y;
		const dx = touch.clientX - dragStart.x;
		const horizontal = Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
		dragX = horizontal ? dx : 0;
		if (!dragStart.fromTop || dy <= 0 || Math.abs(dx) > dy) {
			dragOffset = 0;
			return;
		}
		// Keeps the browser's pull-to-refresh from taking over the same gesture
		if (event.cancelable) event.preventDefault();
		dragOffset = dy;
	}

	function onTouchEnd(event: TouchEvent) {
		const start = dragStart;
		const shouldClose = dragOffset >= CLOSE_DISTANCE;
		dragStart = null;
		dragOffset = 0;
		dragX = 0;
		if (shouldClose) {
			dialog?.close();
			return;
		}
		if (!start || event.type === "touchcancel") return;
		const dx = lastTouch.x - start.x;
		const dy = lastTouch.y - start.y;
		if (Math.abs(dx) >= NAVIGATE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
			onnavigate(dx < 0 ? 1 : -1);
		}
	}

	// Svelte's touch handlers are passive, so preventDefault needs manual listeners
	$effect(() => {
		if (!box) return;
		const el = box;
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

	// Swiping left reveals "next" on the right edge, swiping right reveals "previous" on the left
	const swipeProgress = $derived(Math.min(Math.abs(dragX) / NAVIGATE_DISTANCE, 1));

	const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
</script>

<!-- Fullscreen on the phone: the editor, the conversation and the reply field in one place -->
<dialog bind:this={dialog} class="modal" {onclose}>
	<div
		bind:this={box}
		class="modal-box flex h-dvh max-h-none w-full max-w-none flex-col overscroll-contain rounded-none p-0 {dragOffset ||
		dragX
			? ''
			: 'transition-transform'}"
		style:transform={dragOffset
			? `translateY(${dragOffset}px)`
			: dragX
				? `translateX(${dragX * 0.3}px)`
				: undefined}
	>
		{#if marker}
			<header
				class="flex shrink-0 items-center gap-1 border-b border-base-300 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
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

			<footer
				class="flex shrink-0 justify-end border-t border-base-300 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
			>
				<button
					type="button"
					class="btn btn-square btn-ghost"
					aria-label="Close"
					onclick={() => dialog?.close()}
				>
					<X size={22} />
				</button>
			</footer>
		{/if}
	</div>
	{#if dragX}
		<div
			class="pointer-events-none fixed top-1/2 z-10 flex size-12 items-center justify-center rounded-full shadow-lg {dragX <
			0
				? 'right-3'
				: 'left-3'} {swipeProgress >= 1
				? 'bg-primary text-primary-content'
				: 'bg-base-300 text-base-content'}"
			style:opacity={0.3 + swipeProgress * 0.7}
			style:transform={`translateY(-50%) scale(${0.6 + swipeProgress * 0.4})`}
			aria-hidden="true"
		>
			{#if dragX < 0}<ChevronRight size={28} />{:else}<ChevronLeft size={28} />{/if}
		</div>
	{/if}
</dialog>
