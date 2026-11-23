<script lang="ts">
	// Organizations, projects and timelines: invitations (add people, invite links, who has access),
	// one tab each. Exports: their guest share links.
	import { getSharingTarget } from "./sharing.remote";
	import AddPeople from "./AddPeople.svelte";
	import AccessGrants from "./AccessGrants.svelte";
	import PendingInvitations from "./PendingInvitations.svelte";
	import InviteLinks from "./InviteLinks.svelte";
	import ShareLinks from "./share-links/ShareLinks.svelte";
	import X from "@lucide/svelte/icons/x";
	import Settings from "@lucide/svelte/icons/settings";
	import { resolve } from "$app/paths";
	import FolderOpen from "@lucide/svelte/icons/folder-open";
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import Link from "@lucide/svelte/icons/link";
	import Users from "@lucide/svelte/icons/users";

	type Target =
		{ organizationId: string } | { projectId: string; timelineId?: string; exportId?: string };
	const TYPE_LABELS = { organization: "Organization", project: "Project", timeline: "Timeline" };

	let dialog: HTMLDialogElement | null = null;
	let isOpen = $state(false);
	let target = $state<Target | undefined>();

	const tabs = [
		{ id: "add", label: "Add people", icon: UserPlus },
		{ id: "links", label: "Invite links", icon: Link },
		{ id: "access", label: "Access", icon: Users },
	] as const;
	let tab = $state<(typeof tabs)[number]["id"]>("add");

	export function open(next: Target) {
		target = next;
		tab = "add";
		isOpen = true;
		dialog?.showModal();
	}

	const targetQuery = $derived(isOpen && target ? getSharingTarget(target) : undefined);
	const isExport = $derived(targetQuery?.current?.type === "export");
</script>

<!-- Phones: a sheet from the bottom that fits the visible viewport (dvh, not vh: iOS counts the address bar into vh) -->
<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (isOpen = false)}
>
	<div
		class="modal-box max-h-[90dvh] pt-0 sm:min-h-[32rem] {isExport
			? 'sm:max-w-3xl'
			: 'sm:max-w-xl'}"
	>
		<!-- Sticky so the close button stays reachable while scrolling long content -->
		<div class="sticky top-0 z-10 -mx-6 flex items-start gap-2 bg-base-100 px-6 pt-6 pb-2">
			<div class="min-w-0 flex-1">
				{#if targetQuery?.current?.type === "export"}
					<h3 class="text-lg font-bold break-words">Share link for {targetQuery.current.name}</h3>
					<p class="text-sm text-base-content/60">For external feedback, no account needed.</p>
				{:else if targetQuery?.current}
					<!-- Title and what the invitations are for, in one line -->
					<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<h3 class="text-lg font-bold">Invitations</h3>
						<span
							class="badge max-w-full min-w-0 gap-1.5 badge-soft"
							title="{TYPE_LABELS[targetQuery.current.type]}: {targetQuery.current.name}"
						>
							<FolderOpen class="size-3.5 shrink-0" />
							<span class="truncate">{targetQuery.current.name}</span>
						</span>
					</div>
				{:else}
					<h3 class="text-lg font-bold">
						{target && "exportId" in target && target.exportId ? "Share link" : "Invitations"}
					</h3>
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
			<p class="mt-2 text-sm text-error">
				Could not load this {!target || "organizationId" in target
					? "organization"
					: target.exportId
						? "export"
						: target.timelineId
							? "timeline"
							: "project"}.
			</p>
		{:else if targetQuery?.current}
			{#if targetQuery.current.type !== "export"}
				{@const t = { type: targetQuery.current.type, id: targetQuery.current.id }}
				<div role="tablist" class="tabs tabs-border mt-2" aria-label="Invitations">
					{#each tabs as item (item.id)}
						<button
							type="button"
							role="tab"
							class="tab gap-2"
							class:tab-active={tab === item.id}
							aria-selected={tab === item.id}
							onclick={() => (tab = item.id)}
						>
							<item.icon class="size-4" />
							{item.label}
						</button>
					{/each}
				</div>
				<div role="tabpanel" class="mt-4 flex flex-col gap-3">
					{#if tab === "add"}
						<AddPeople target={t} />
					{:else if tab === "links"}
						<InviteLinks target={t} />
					{:else}
						{#if targetQuery.current.type !== "organization"}
							<AccessGrants
								target={{ type: targetQuery.current.type, id: targetQuery.current.id }}
							/>
						{/if}
						<PendingInvitations target={t} />
						<a
							class="btn self-start btn-ghost btn-sm"
							href={resolve("/(root)/organizations/[organization]/settings/members", {
								organization: targetQuery.current.organizationSlug,
							})}
							onclick={() => dialog?.close()}
						>
							<Settings class="size-4" />
							Manage all members
						</a>
					{/if}
				</div>
			{:else}
				<ShareLinks exportId={targetQuery.current.id} onscreening={() => dialog?.close()} />
			{/if}
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}
	</div>
	<!-- The button is needed: tapping the backdrop submits this form, which closes the dialog -->
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
