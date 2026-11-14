<script lang="ts">
	import AppWindow from "@lucide/svelte/icons/app-window";
	import Link from "@lucide/svelte/icons/link";
	import Projector from "@lucide/svelte/icons/projector";
	import Trash from "@lucide/svelte/icons/trash-2";
	import {
		getShareLinks,
		revokeShareLink,
	} from "#lib/components/sharing/share-links/share-links.remote.ts";
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
	const active = $derived(link?.status === "active");

	let deleteLink = $state(false);
	let busy = $state(false);
	let problem = $state<string | null>(null);

	$effect(() => {
		if (request) {
			deleteLink = false;
			problem = null;
			dialog?.showModal();
		} else dialog?.close();
	});

	async function confirm() {
		const after = request?.after;
		if (deleteLink && link) {
			busy = true;
			problem = null;
			try {
				await revokeShareLink({ id: link.id });
			} catch {
				problem = "The link could not be deleted. The screening is still running.";
				return;
			} finally {
				busy = false;
			}
		}
		stopScreening();
		after?.();
	}
</script>

<!-- Closing it any other way (Escape, backdrop) means "keep going" -->
<dialog class="modal" bind:this={dialog} onclose={() => (screening.endRequest = null)}>
	<div class="modal-box max-w-md">
		<h3 class="flex items-center gap-2 text-lg font-bold">
			<Projector size={20} /> End the screening?
		</h3>
		<ul class="mt-4 grid gap-2.5 text-sm">
			<li class="flex items-center gap-3">
				<AppWindow size={18} class="shrink-0 text-base-content/60" />
				The screening window closes.
			</li>
			{#if active && !deleteLink}
				<li class="flex items-center gap-3">
					<Link size={18} class="shrink-0 text-base-content/60" />
					Guests can add markers until {link!.expiresAt.toLocaleString(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					})}.
				</li>
			{/if}
		</ul>

		{#if active && link?.canRevoke}
			<label
				class="mt-4 flex cursor-pointer items-center gap-3 rounded-box border border-base-300 p-3 text-sm has-checked:border-error"
			>
				<input
					type="checkbox"
					class="checkbox checkbox-sm checkbox-error"
					bind:checked={deleteLink}
				/>
				<Trash size={18} class="shrink-0 text-error" />
				<span>
					<strong>Delete the link now</strong>
					<span class="block text-base-content/60">Guests can't join or add markers anymore.</span>
				</span>
			</label>
		{/if}

		{#if problem}<p role="alert" class="mt-3 text-sm text-error">{problem}</p>{/if}

		<div class="modal-action">
			<button class="btn" disabled={busy} onclick={() => dialog?.close()}>Keep going</button>
			<button class="btn btn-error" disabled={busy} onclick={confirm}>
				{deleteLink ? "End & delete link" : "End screening"}
				{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
