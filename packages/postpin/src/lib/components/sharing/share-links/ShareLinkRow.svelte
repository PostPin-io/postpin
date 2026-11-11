<script lang="ts">
	import { page } from "$app/state";
	import Check from "@lucide/svelte/icons/check";
	import Clock from "@lucide/svelte/icons/clock";
	import Copy from "@lucide/svelte/icons/copy";
	import Info from "@lucide/svelte/icons/info";
	import Mail from "@lucide/svelte/icons/mail";
	import QrCode from "@lucide/svelte/icons/qr-code";
	import Settings from "@lucide/svelte/icons/settings";
	import Trash from "@lucide/svelte/icons/trash-2";
	import PanelLayout from "./PanelLayout.svelte";
	import SendShareLinkForm from "./SendShareLinkForm.svelte";
	import {
		formatExpiry,
		formatLastViewed,
		formatViews,
		remainingTime,
		shareLinkUrl,
		type ShareLinkRow,
	} from "./share-links.ts";

	interface Props {
		link: ShareLinkRow;
		busy: boolean;
		onedit: () => void;
		onrevoke: () => void;
		onqr: () => void;
	}
	let { link, busy, onedit, onrevoke, onqr }: Props = $props();

	const url = $derived(shareLinkUrl(page.url.origin, link.token));
	const left = $derived(remainingTime(link.expiresAt));
	const active = $derived(link.status === "active");
	// The URL isn't shown, only copied: the note's first line (or the creation date) tells links apart
	const label = $derived(link.note?.split("\n")[0]?.trim() || null);
	const created = $derived(
		new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(link.createdAt),
	);

	let copied = $state(false);
	let confirmRevoke = $state(false);
	let infoOpen = $state(false);
	let sending = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	// Deleting needs a second click on the same button within 3 seconds
	function revoke() {
		if (!confirmRevoke) {
			confirmRevoke = true;
			setTimeout(() => (confirmRevoke = false), 3000);
			return;
		}
		confirmRevoke = false;
		onrevoke();
	}
</script>

<li class="rounded-box border border-base-300 px-2.5 py-1.5">
	<div class="flex items-center gap-3">
		<!-- Expired: everything but the buttons greyed out -->
		<div class="flex min-w-0 flex-1 items-center gap-3 {active ? '' : 'opacity-50'}">
			<PanelLayout mini timeline={link.timelinePanelVisible} markers={link.markerPanelVisible} />
			{#if label}
				<span class="min-w-0 flex-1 truncate text-sm" title={link.note}>{label}</span>
			{:else}
				<span class="hidden min-w-0 flex-1 truncate text-sm text-base-content/50 sm:inline"
					>Created {created}</span
				>
			{/if}
			<span
				class="flex items-center gap-1 text-sm whitespace-nowrap {left.warn
					? 'text-error'
					: 'text-base-content/60'}"
				title={active ? `Expires ${link.expiresAt.toLocaleString()}` : "Expired, edit to renew"}
			>
				<Clock size={14} />{left.text}
			</span>
		</div>

		<div class="flex shrink-0 gap-1">
			{#if link.canUpdate}
				<button
					type="button"
					class="btn btn-square btn-ghost btn-sm"
					title={active ? "Edit" : "Edit to renew"}
					aria-label="Edit"
					disabled={busy}
					onclick={onedit}
				>
					<Settings size={16} title={active ? "Settings" : "Settings (renew the link)"} />
				</button>
			{/if}
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm {infoOpen ? 'btn-active' : ''}"
				title="Details"
				aria-label="Details"
				aria-expanded={infoOpen}
				onclick={() => (infoOpen = !infoOpen)}
			>
				<Info size={16} />
			</button>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title={copied ? "Copied" : "Copy link"}
				aria-label="Copy link"
				disabled={!active}
				onclick={copy}
			>
				{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}
			</button>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="QR code"
				aria-label="QR code"
				disabled={!active}
				onclick={onqr}
			>
				<QrCode size={16} />
			</button>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm {sending ? 'btn-active' : ''}"
				title="Send by e-mail"
				aria-label="Send by e-mail"
				aria-expanded={sending}
				disabled={!active}
				onclick={() => (sending = !sending)}
			>
				<Mail size={16} />
			</button>
			{#if link.canRevoke}
				<button
					type="button"
					class="btn btn-square btn-sm {confirmRevoke ? 'btn-error' : 'btn-ghost'}"
					title={confirmRevoke ? "Click again to delete" : "Delete"}
					aria-label={confirmRevoke ? "Confirm delete" : "Delete"}
					disabled={busy}
					onclick={revoke}
				>
					{#if confirmRevoke}<Check size={16} />{:else}<Trash size={16} />{/if}
				</button>
			{/if}
		</div>
	</div>

	{#if infoOpen}
		<dl
			class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-base-300 pt-2 text-xs text-base-content/70"
		>
			<dt>Visits</dt>
			<dd>{formatViews(link.viewCount, link.guestCount)}</dd>
			<dt>Last opened</dt>
			<dd>{formatLastViewed(link.lastViewedAt)}</dd>
			<dt>Expiry</dt>
			<dd>{formatExpiry(link.expiresAt)} ({link.expiresAt.toLocaleString()})</dd>
			<dt>Created by</dt>
			<dd>{link.creator?.name ?? "a former member"}</dd>
			{#if link.note}
				<dt>Note</dt>
				<dd class="whitespace-pre-line">{link.note}</dd>
			{/if}
		</dl>
	{/if}

	{#if sending && active}
		<SendShareLinkForm linkId={link.id} onclose={() => (sending = false)} />
	{/if}
</li>
