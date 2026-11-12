<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import Send from "@lucide/svelte/icons/send";
	import LocateFixed from "@lucide/svelte/icons/locate-fixed";
	import Trash from "@lucide/svelte/icons/trash";
	import UpdateMarker from "./UpdateMarker.svelte";
	import { createResponse, getResponses } from "./markers.remote";
	import { useShare } from "../share-context.ts";
	import type { ReviewMarker } from "./types";

	interface Props {
		marker: ReviewMarker;
		startFrame: number;
		onclose: () => void;
		/** Opens the position modal for this marker */
		onchangeposition: () => void;
	}
	let { marker, startFrame, onclose, onchangeposition }: Props = $props();

	let updateMarkerComponent: UpdateMarker | null = $state(null);
	let deleting = $state(false);

	const getShare = useShare();
	const share = $derived(getShare());

	// Guests have no conversations. Not awaited: a card sliding in must not hold up the swipe
	const responsesQuery = $derived(share ? null : getResponses(marker.id));
	const responses = $derived(responsesQuery?.current ?? []);

	// Each card keeps its own draft, so it stays with its marker while swiping
	let reply = $state("");
	let sending = $state(false);

	async function send() {
		const content = reply.trim();
		if (!content || sending) return;
		sending = true;
		try {
			await createResponse({ markerId: marker.id, content });
			reply = "";
		} finally {
			sending = false;
		}
	}

	async function deleteMarker() {
		if (!updateMarkerComponent || deleting) return;
		deleting = true;
		try {
			await updateMarkerComponent.remove();
		} finally {
			deleting = false;
		}
	}

	/** Moves the marker to another frame, saved together with the other fields */
	export function moveTo(frame: number) {
		updateMarkerComponent?.moveTo(frame);
	}

	const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
</script>

<header class="flex min-h-14 shrink-0 items-center gap-1 border-b border-base-300 px-2 py-2">
	{#if marker.canDelete}
		<button
			type="button"
			class="btn btn-square btn-error"
			title="Delete marker"
			aria-label="Delete marker"
			disabled={deleting}
			onclick={() => void deleteMarker()}
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

<!-- data-scroller: the modal checks it to tell a scroll from a swipe-down-to-close -->
<div data-scroller class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
	<UpdateMarker bind:this={updateMarkerComponent} {marker} {startFrame} mobile {onclose}>
		{#snippet mobileHeaderAction()}
			{#if marker.canUpdate}
				<button
					type="button"
					class="btn btn-square btn-ghost"
					title="Change position"
					aria-label="Change marker position"
					onclick={onchangeposition}
				>
					<LocateFixed size={20} />
				</button>
			{/if}
		{/snippet}
	</UpdateMarker>

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
						{response.author?.name ?? "Deleted User"} · {dateTimeFormat.format(response.createdAt)}
					</p>
				</div>
			{:else}
				<p class="text-sm text-base-content/60">No responses yet.</p>
			{/each}
		</section>
	{/if}
</div>

<footer class="flex shrink-0 justify-end border-t border-base-300 px-3 py-2">
	<button type="button" class="btn btn-square btn-ghost" aria-label="Close" onclick={onclose}>
		<X size={22} />
	</button>
</footer>
