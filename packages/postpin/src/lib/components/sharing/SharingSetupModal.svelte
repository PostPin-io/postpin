<script lang="ts">
	import { page } from "$app/state";
	import { getSharingTarget } from "./sharing.remote";
	import { authClient } from "#lib/auth-client.ts";
	import OrganizationInvite from "./OrganizationInvite.svelte";
	import AccessGrants from "./AccessGrants.svelte";
	import TargetInvite from "./TargetInvite.svelte";
	import ShareLinks from "./ShareLinks.svelte";
	import X from "@lucide/svelte/icons/x";

	const session = authClient.useSession();
	const organizationId = $derived($session.data?.session.activeOrganizationId);

	let dialog: HTMLDialogElement | null = null;
	let isOpen = $state(false);

	type Target = { projectId: string; timelineId?: string; exportId?: string };
	// Lets pages outside a project route (e.g. the dashboard) share a specific project
	let explicitTarget = $state<Target | undefined>();

	export function open(target?: Target) {
		explicitTarget = target;
		isOpen = true;
		dialog?.showModal();
	}

	// Detected from the current route unless the caller passed a target
	const target = $derived<Target | undefined>(
		explicitTarget ??
			(page.params.project
				? {
						projectId: page.params.project,
						timelineId: page.params.timeline,
						exportId: page.params.export,
					}
				: undefined),
	);
	const targetQuery = $derived(isOpen && target ? getSharingTarget(target) : undefined);
</script>

<dialog class="modal" bind:this={dialog} onclose={() => (isOpen = false)}>
	<div class="modal-box min-h-[32rem] {targetQuery?.current?.type === 'export' ? 'max-w-3xl' : ''}">
		<div class="flex items-start gap-2">
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

		{#if !target}
			{#if isOpen && organizationId}
				<OrganizationInvite {organizationId} />
			{/if}
		{:else if targetQuery?.error}
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
	<form method="dialog" class="modal-backdrop"></form>
</dialog>
