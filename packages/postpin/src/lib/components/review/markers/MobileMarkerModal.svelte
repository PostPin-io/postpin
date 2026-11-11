<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import Send from "@lucide/svelte/icons/send";
	import LocateFixed from "@lucide/svelte/icons/locate-fixed";
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
	}
	let { marker, startFrame, frameRate, onclose, onseek }: Props = $props();

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

	const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
</script>

<!-- Fullscreen on the phone: the editor, the conversation and the reply field in one place -->
<dialog bind:this={dialog} class="modal" {onclose}>
	<div class="modal-box flex h-dvh max-h-none w-full max-w-none flex-col rounded-none p-0">
		{#if marker}
			<header
				class="flex shrink-0 items-center gap-1 border-b border-base-300 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
			>
				<button
					type="button"
					class="btn btn-square btn-ghost"
					aria-label="Close"
					onclick={() => dialog?.close()}
				>
					<X size={22} />
				</button>
				<h2 class="min-w-0 flex-1 truncate text-lg font-semibold">
					{marker.name?.trim() || "Marker"}
				</h2>
				<!-- Jumps the video to the marker and goes back to it -->
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
					<span class="font-mono">{formatTimecode(marker.frame, frameRate)}</span>
				</button>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto">
				{#key marker.id}
					<UpdateMarker {marker} {startFrame} mobile onclose={() => dialog?.close()} />
				{/key}

				{#if !share}
					<section class="flex flex-col gap-3 px-4 pb-4" aria-label="Responses">
						<h3 class="font-semibold">Responses ({responses.length})</h3>
						{#each responses as response (response.id)}
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

			{#if !share}
				<form
					class="flex shrink-0 items-end gap-2 border-t border-base-300 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
			{/if}
		{/if}
	</div>
</dialog>
