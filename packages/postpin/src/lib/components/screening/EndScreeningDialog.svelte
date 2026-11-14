<script lang="ts">
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";
	import { screening, stopScreening } from "./screening.svelte.ts";

	// Asks back before a screening ends, wherever that was asked for (requestStopScreening).
	// Mounted once, in the export view: a screening only runs while that view is open.

	let dialog = $state<HTMLDialogElement>();
	const request = $derived(screening.endRequest);
	const session = $derived(screening.session);

	// Only read while the question is open; the share-link list has it cached
	const link = $derived(
		request && session
			? getShareLinks(session.exportId).current?.find((l) => l.id === session.link.id)
			: undefined,
	);

	$effect(() => {
		if (request) dialog?.showModal();
		else dialog?.close();
	});

	function confirm() {
		const after = request?.after;
		stopScreening();
		after?.();
	}
</script>

<!-- Closing it any other way (Escape, backdrop) means "keep going" -->
<dialog class="modal" bind:this={dialog} onclose={() => (screening.endRequest = null)}>
	<div class="modal-box max-w-md">
		<h3 class="text-lg font-bold">End the screening?</h3>
		<p class="mt-2 text-sm text-base-content/70">
			The screening window closes.
			{#if link?.status === "active"}
				The link stays active until {link.expiresAt.toLocaleString()}: your guests can still add
				markers, and you can start the screening again with it.
			{:else}
				The screening link stays in the share links.
			{/if}
		</p>
		<div class="modal-action">
			<button class="btn" onclick={() => dialog?.close()}>Keep going</button>
			<button class="btn btn-error" onclick={confirm}>End screening</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
