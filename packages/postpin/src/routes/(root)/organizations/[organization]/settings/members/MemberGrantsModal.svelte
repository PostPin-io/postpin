<script lang="ts">
	import { getMemberGrants, removeGrant } from "#lib/components/sharing/grants.remote.ts";

	let dialog: HTMLDialogElement | null = null;
	let member = $state<{ id: string; name: string } | null>(null);

	export function open(id: string, name: string) {
		member = { id, name };
		dialog?.showModal();
	}

	const grants = $derived(member ? getMemberGrants(member.id) : undefined);

	let removing = $state<string | null>(null);
	async function remove(grantId: string) {
		removing = grantId;
		try {
			await removeGrant(grantId);
			await grants?.refresh();
		} catch (e) {
			alert(`Could not remove access: ${(e as Error).message}`);
		}
		removing = null;
	}
</script>

<dialog class="modal" bind:this={dialog} onclose={() => (member = null)}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Access of {member?.name}</h3>
		{#if grants?.error}
			<p class="mt-2 text-sm text-error">Could not load access.</p>
		{:else if grants?.current}
			{#if grants.current.length === 0}
				<p class="mt-2 text-sm text-base-content/70">No projects or timelines you can see.</p>
			{/if}
			<ul class="mt-2 flex flex-col gap-1">
				{#each grants.current as g (g.id)}
					<li class="flex items-center justify-between">
						<span>{g.label} <span class="badge badge-ghost badge-sm">{g.kind}</span></span>
						{#if g.canDelete}
							<button
								class="btn btn-ghost btn-xs"
								disabled={removing === g.id}
								onclick={() => remove(g.id)}
							>
								Remove
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}
		<div class="modal-action">
			<button class="btn" onclick={() => dialog?.close()}>Close</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
