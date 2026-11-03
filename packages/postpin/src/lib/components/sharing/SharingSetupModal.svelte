<script lang="ts">
	import { page } from "$app/state";
	import { getSharingTarget } from "./sharing.remote";
	import { authClient } from "#lib/auth-client.ts";
	import OrganizationInvite from "./OrganizationInvite.svelte";

	const session = authClient.useSession();
	const organizationId = $derived($session.data?.session.activeOrganizationId);

	let dialog: HTMLDialogElement | null = null;
	let isOpen = $state(false);

	export function open() {
		isOpen = true;
		dialog?.showModal();
	}

	// Detected from the current route, so it follows wherever the modal is opened
	const targetQuery = $derived(
		isOpen && page.params.project
			? getSharingTarget({
					projectId: page.params.project,
					timelineId: page.params.timeline,
					exportId: page.params.export,
				})
			: undefined,
	);
</script>

<dialog class="modal" bind:this={dialog} onclose={() => (isOpen = false)}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Time to collaborate</h3>

		{#if !page.params.project}
			{#if isOpen && organizationId}
				<OrganizationInvite {organizationId} />
			{/if}
		{:else if targetQuery?.error}
			<p class="mt-2 text-sm text-error">Could not load what you are sharing.</p>
		{:else if targetQuery?.current}
			<p class="mt-2 text-sm text-base-content/70">
				You are sharing the {targetQuery.current.type}: {targetQuery.current.name}
			</p>
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}

		<div class="modal-action">
			<button class="btn" onclick={() => dialog?.close()}>Close</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"></form>
</dialog>
