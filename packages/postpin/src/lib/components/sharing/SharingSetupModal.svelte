<script lang="ts">
	import { getSharingTarget } from "./sharing.remote";
	import AccessGrants from "./AccessGrants.svelte";
	import TargetInvite from "./TargetInvite.svelte";
	import ShareLinks from "./share-links/ShareLinks.svelte";
	import X from "@lucide/svelte/icons/x";

	type Target = { projectId: string; timelineId?: string; exportId?: string };

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

<!-- Phones: a sheet from the bottom that fits the visible viewport (dvh, not vh: iOS counts the address bar into vh) -->
<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (isOpen = false)}
>
	<div
		class="modal-box max-h-[90dvh] pt-0 sm:min-h-[32rem] {targetQuery?.current?.type === 'export'
			? 'sm:max-w-3xl'
			: ''}"
	>
		<!-- Sticky so the close button stays reachable while scrolling long content -->
		<div class="sticky top-0 z-10 -mx-6 flex items-start gap-2 bg-base-100 px-6 pt-6 pb-2">
			<div class="min-w-0 flex-1">
				<h3 class="text-lg font-bold">Time to collaborate</h3>
				{#if targetQuery?.current?.type === "export"}
					<p class="text-sm break-words text-base-content/60">
						Sharing {targetQuery.current.name} of {targetQuery.current.timelineName}
					</p>
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
			<p class="mt-2 text-sm text-error">Could not load what you are sharing.</p>
		{:else if targetQuery?.current}
			{#if targetQuery.current.type !== "export"}
				{@const shareTarget = { type: targetQuery.current.type, id: targetQuery.current.id }}
				<p class="mt-2 text-sm text-base-content/70">
					You are sharing the {targetQuery.current.type}: {targetQuery.current.name}
				</p>
				<AccessGrants target={shareTarget} />
				<div class="divider my-2"></div>
				<TargetInvite target={shareTarget} />
			{:else}
				<ShareLinks exportId={targetQuery.current.id} />
			{/if}
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}
	</div>
	<!-- The button is needed: tapping the backdrop submits this form, which closes the dialog -->
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
