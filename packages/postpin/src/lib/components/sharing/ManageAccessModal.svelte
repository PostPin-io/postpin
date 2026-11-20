<script lang="ts">
	// Who can get into a project or timeline right now. Inviting more people is SharingSetupModal's job.
	import { getSharingTarget } from "./sharing.remote";
	import AccessGrants from "./AccessGrants.svelte";
	import PendingInvitations from "./PendingInvitations.svelte";
	import ActiveInviteLinks from "./ActiveInviteLinks.svelte";
	import X from "@lucide/svelte/icons/x";

	type Target = { projectId: string; timelineId?: string };

	interface Props {
		/** Shows an "Invite people" button that hands over to the invite dialog */
		oninvite?: (target: Target) => void;
	}
	let { oninvite }: Props = $props();

	let dialog: HTMLDialogElement | null = null;
	let isOpen = $state(false);
	let target = $state<Target | undefined>();

	export function open(next: Target) {
		target = next;
		isOpen = true;
		dialog?.showModal();
	}

	const targetQuery = $derived(isOpen && target ? getSharingTarget(target) : undefined);
</script>

<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (isOpen = false)}
>
	<div class="modal-box max-h-[90dvh] pt-0 sm:max-w-2xl">
		<div class="sticky top-0 z-10 -mx-6 flex items-start gap-2 bg-base-100 px-6 pt-6 pb-2">
			<div class="min-w-0 flex-1">
				{#if targetQuery?.current && targetQuery.current.type !== "export"}
					<h3 class="text-lg font-bold break-words">Access to {targetQuery.current.name}</h3>
					<p class="text-sm text-base-content/60">
						People, pending invitations and invite links for this {targetQuery.current.type}.
					</p>
				{:else}
					<h3 class="text-lg font-bold">Access</h3>
				{/if}
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="Close"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>

		{#if targetQuery?.error}
			<p class="mt-2 text-sm text-error">Could not load who has access.</p>
		{:else if targetQuery?.current && targetQuery.current.type !== "export"}
			{@const t = { type: targetQuery.current.type, id: targetQuery.current.id }}
			<section class="mt-4 flex flex-col gap-2">
				<h4 class="font-semibold">People with access</h4>
				<AccessGrants target={t} />
			</section>
			<div class="divider my-2"></div>
			<section class="flex flex-col gap-2">
				<h4 class="font-semibold">Pending invitations</h4>
				<PendingInvitations target={t} />
			</section>
			<div class="divider my-2"></div>
			<section class="flex flex-col gap-2">
				<h4 class="font-semibold">Invite links</h4>
				<ActiveInviteLinks target={t} />
			</section>

			{#if oninvite && target}
				{@const next = target}
				<div class="modal-action">
					<button
						type="button"
						class="btn btn-primary"
						onclick={() => {
							dialog?.close();
							oninvite(next);
						}}>Invite people</button
					>
				</div>
			{/if}
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
