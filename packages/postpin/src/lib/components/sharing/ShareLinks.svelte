<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import {
		createShareLink,
		getShareLinks,
		revokeShareLink,
		updateShareLink,
	} from "./share-links.remote";
	import ShareLinkForm from "./ShareLinkForm.svelte";
	import {
		STATUS_LABELS,
		clipboardText,
		editLinkValues,
		formatExpiry,
		newLinkValues,
		shareLinkUrl,
		toCreateInput,
		toUpdateInput,
		type ShareLinkFormValues,
	} from "./shareLinks.ts";

	interface Props {
		exportId: string;
	}
	let { exportId }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	// Reviewers have no share-link rights at all: no requests, nothing shown
	const mayShare = $derived(role ? roleAllows(role, "shareLink", "create") : false);

	const links = $derived(mayShare ? getShareLinks(exportId) : undefined);
	// Revoked links stay in the DB for traceability, but aren't managed here
	const visible = $derived(links?.current?.filter((l) => l.status !== "revoked") ?? []);

	let creating = $state(false);
	let editingId = $state<string | null>(null);
	let copiedId = $state<string | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);

	async function run(action: () => Promise<unknown>) {
		busy = true;
		problem = null;
		try {
			await action();
			return true;
		} catch (e) {
			problem = (e as Error).message;
			return false;
		} finally {
			busy = false;
		}
	}

	async function create(values: ShareLinkFormValues) {
		if (await run(() => createShareLink(toCreateInput(exportId, values)))) creating = false;
	}

	async function save(id: string, values: ShareLinkFormValues) {
		if (await run(() => updateShareLink(toUpdateInput(id, values)))) editingId = null;
	}

	async function revoke(id: string) {
		if (!confirm("Revoke this link? Everyone who has it loses access.")) return;
		await run(() => revokeShareLink({ id }));
	}

	async function copy(link: { id: string; token: string; note: string | null }) {
		await navigator.clipboard.writeText(
			clipboardText(shareLinkUrl(page.url.origin, link.token), link.note),
		);
		copiedId = link.id;
		setTimeout(() => {
			if (copiedId === link.id) copiedId = null;
		}, 2000);
	}
</script>

{#if mayShare}
	<div class="mt-4 flex items-center justify-between">
		<h4 class="font-semibold">Share links</h4>
		{#if !creating}
			<button class="btn btn-primary btn-sm" onclick={() => (creating = true)}>New link</button>
		{/if}
	</div>
	<p class="text-sm text-base-content/70">
		Anyone with the link can watch this export and leave markers, without an account.
	</p>

	{#if creating}
		<div class="mt-3 rounded-box border border-base-300 p-3">
			<ShareLinkForm
				initial={newLinkValues()}
				submitLabel="Create link"
				{busy}
				onsubmit={create}
				oncancel={() => (creating = false)}
			/>
		</div>
	{/if}

	{#if problem}<p class="mt-2 text-sm text-error">{problem}</p>{/if}

	{#if links?.error}
		<p class="mt-2 text-sm text-error">Could not load share links.</p>
	{:else if !links?.current}
		<span class="loading mt-2 loading-spinner"></span>
	{:else if visible.length === 0 && !creating}
		<p class="mt-3 text-sm text-base-content/50">No share links yet.</p>
	{:else}
		<ul class="mt-3 flex flex-col gap-2">
			{#each visible as link (link.id)}
				<li class="rounded-box border border-base-300 p-3">
					{#if editingId === link.id}
						<ShareLinkForm
							initial={editLinkValues(link)}
							editing
							submitLabel="Save"
							{busy}
							onsubmit={(values) => save(link.id, values)}
							oncancel={() => (editingId = null)}
						/>
					{:else}
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span
								class="badge badge-sm {link.status === 'active' ? 'badge-success' : 'badge-ghost'}"
							>
								{STATUS_LABELS[link.status]}
							</span>
							<span class="flex-1 text-base-content/70">
								{formatExpiry(link.expiresAt)} · by {link.creator?.name ?? "a former member"}
							</span>
							<button
								class="btn btn-ghost btn-xs"
								disabled={link.status !== "active"}
								onclick={() => copy(link)}
							>
								{copiedId === link.id ? "Copied" : "Copy"}
							</button>
							{#if link.canUpdate}
								<button
									class="btn btn-ghost btn-xs"
									disabled={busy}
									onclick={() => (editingId = link.id)}>Edit</button
								>
							{/if}
							{#if link.canRevoke}
								<button
									class="btn btn-ghost text-error btn-xs"
									disabled={busy}
									onclick={() => revoke(link.id)}>Revoke</button
								>
							{/if}
						</div>
						<div class="mt-1 flex gap-1">
							{#if link.markerPanelVisible}<span class="badge badge-outline badge-xs">Markers</span
								>{/if}
							{#if link.timelinePanelVisible}<span class="badge badge-outline badge-xs"
									>Timeline</span
								>{/if}
						</div>
						{#if link.note}
							<p class="mt-2 line-clamp-2 text-sm whitespace-pre-line text-base-content/80">
								{link.note}
							</p>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
