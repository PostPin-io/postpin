<script lang="ts">
	import { page } from "$app/state";
	import Info from "@lucide/svelte/icons/info";
	import Link from "@lucide/svelte/icons/link";
	import Plus from "@lucide/svelte/icons/plus";
	import { authClient } from "#lib/auth-client.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import {
		createShareLink,
		getShareLinks,
		revokeShareLink,
		updateShareLink,
	} from "./share-links.remote";
	import ShareLinkForm from "./ShareLinkForm.svelte";
	import ShareLinkQr from "./ShareLinkQr.svelte";
	import ShareLinkRow from "./ShareLinkRow.svelte";
	import {
		editLinkValues,
		newLinkValues,
		orderedLinks,
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
	// Active first, expired after; revoked ones stay in the DB for traceability, but aren't shown
	const ordered = $derived(orderedLinks(links?.current ?? []));

	let creating = $state(false);
	let editingId = $state<string | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let qrUrl = $state<string | null>(null);

	// Without any link yet the modal opens straight into the form
	let autoOpened = false;
	$effect(() => {
		if (autoOpened || !links?.current) return;
		autoOpened = true;
		if (ordered.length === 0) creating = true;
	});

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

	function startCreate() {
		editingId = null;
		creating = true;
	}

	function startEdit(id: string) {
		creating = false;
		editingId = id;
	}

	async function create(values: ShareLinkFormValues) {
		if (await run(() => createShareLink(toCreateInput(exportId, values)))) creating = false;
	}

	async function save(id: string, values: ShareLinkFormValues) {
		if (await run(() => updateShareLink(toUpdateInput(id, values)))) editingId = null;
	}
</script>

{#if mayShare}
	<div class="mt-2 flex items-center gap-1.5 border-t border-base-300 pt-2.5">
		<Link size={16} />
		<strong>Share links</strong>
		<span
			class="tooltip tooltip-bottom"
			data-tip="Anyone with the link can watch this export and leave markers, without an account."
		>
			<Info size={14} class="cursor-help text-base-content/60" />
		</span>
		<span class="flex-1"></span>
		<button
			type="button"
			class="btn btn-square btn-primary btn-sm"
			title="New link"
			aria-label="New link"
			disabled={creating}
			onclick={startCreate}
		>
			<Plus size={16} />
		</button>
	</div>

	{#if problem}<p class="mt-2 text-sm text-error">{problem}</p>{/if}

	{#if links?.error}
		<p class="mt-2 text-sm text-error">Could not load share links.</p>
	{:else if !links?.current}
		<span class="loading mt-2 loading-spinner"></span>
	{:else}
		<ul class="mt-2 grid gap-2">
			{#if creating}
				<li>
					<ShareLinkForm
						initial={newLinkValues()}
						submitLabel="Create link"
						{busy}
						onsubmit={create}
						oncancel={() => (creating = false)}
					/>
				</li>
			{/if}
			{#each ordered as link (link.id)}
				{#if editingId === link.id}
					<li>
						<ShareLinkForm
							initial={editLinkValues(link)}
							editing
							currentExpiresAt={link.expiresAt}
							submitLabel="Save"
							{busy}
							onsubmit={(values) => save(link.id, values)}
							oncancel={() => (editingId = null)}
						/>
					</li>
				{:else}
					<ShareLinkRow
						{link}
						{busy}
						onedit={() => startEdit(link.id)}
						onrevoke={() => run(() => revokeShareLink({ id: link.id }))}
						onqr={() => (qrUrl = shareLinkUrl(page.url.origin, link.token))}
					/>
				{/if}
			{/each}
		</ul>
		{#if ordered.length === 0 && !creating}
			<p class="mt-2 text-sm text-base-content/50">No share links yet</p>
		{/if}
	{/if}

	<ShareLinkQr url={qrUrl} onclose={() => (qrUrl = null)} />
{/if}
