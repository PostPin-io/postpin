<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import History from "@lucide/svelte/icons/history";
	import type { MarkerSetSideSummary } from "@postpin-io/shared/logic/marker-sets";
	import { errorMessage } from "../errors";
	import { restoredSides, type MarkerSetEntry } from "../history";
	import { hostInfo } from "./hosts";

	// The marker sets (backups before every push, pull, delete all and restore) of the NLE timeline,
	// newest first. Undo brings the side(s) an action changed back to how they were before it.
	interface Props {
		load: () => Promise<MarkerSetEntry[]>;
		/** closes the dialog itself; the restore runs like the other marker actions */
		onRestore: (set: MarkerSetEntry) => void;
	}

	let { load, onRestore }: Props = $props();

	let dialog: HTMLDialogElement | null = null;
	let sets = $state<MarkerSetEntry[] | null>(null);
	let error = $state<string | null>(null);
	// the entry whose undo waits for a second click
	let confirming = $state<string | null>(null);

	export async function open() {
		sets = null;
		error = null;
		confirming = null;
		dialog?.showModal();
		try {
			sets = await load();
		} catch (err) {
			error = errorMessage(err);
		}
	}

	function restore(set: MarkerSetEntry) {
		if (confirming !== set.id) {
			confirming = set.id;
			return;
		}
		dialog?.close();
		onRestore(set);
	}

	const hostLabel = (set: MarkerSetEntry) => hostInfo(set.hostName).displayName;

	function title(set: MarkerSetEntry) {
		const host = hostLabel(set);
		switch (set.action) {
			case "PUSH":
				return `${host} → PostPin`;
			case "PULL":
				return `PostPin → ${host}`;
			case "CLEAR":
				return `Deleted all markers in ${host}`;
			case "RESTORE":
				return "Restored a backup";
		}
	}

	function describe(side: string, summary: MarkerSetSideSummary | undefined) {
		if (!summary) return null;
		const parts = [
			summary.added && `${summary.added} new`,
			summary.updated && `${summary.updated} changed`,
			summary.removed && `${summary.removed} deleted`,
		].filter(Boolean);
		return parts.length ? `${side}: ${parts.join(", ")}` : null;
	}

	const changes = (set: MarkerSetEntry) =>
		[describe(hostLabel(set), set.summary.nle), describe("PostPin", set.summary.postpin)]
			.filter(Boolean)
			.join(" · ");

	const canUndo = (set: MarkerSetEntry) => {
		const sides = restoredSides(set);
		// The PostPin side needs the export the action worked on
		return (sides.nle || sides.postpin) && (!sides.postpin || !!set.exportId);
	};

	function undoHint(set: MarkerSetEntry) {
		const sides = restoredSides(set);
		const host = hostLabel(set);
		if (sides.nle && sides.postpin) return `Brings back the markers in ${host} and in PostPin`;
		if (sides.nle) return `Brings back the markers in ${host} as they were before`;
		return "Brings back the export's markers in PostPin as they were before";
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box max-w-2xl">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<History size={18} /> Marker history
			</h3>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => dialog?.close()}>
				<X />
			</button>
		</div>
		<p class="pt-1 text-sm text-base-content/60">
			Every sync, delete all and restore backs up the markers first. Undo brings them back as they
			were before that action. Later changes to those markers are replaced.
		</p>

		{#if error}
			<div role="alert" class="mt-4 alert alert-error"><span>{error}</span></div>
		{:else if !sets}
			<div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>
		{:else if sets.length === 0}
			<p class="py-8 text-center text-sm text-base-content/60">No backups for this timeline yet.</p>
		{:else}
			<ul class="mt-4 flex max-h-[60vh] flex-col divide-y divide-base-content/10 overflow-y-auto">
				{#each sets as set (set.id)}
					<li class="flex items-center gap-3 py-2">
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{title(set)}</p>
							<p class="truncate text-xs text-base-content/60">
								{new Date(set.createdAt).toLocaleString()}
								{#if set.createdBy}· {set.createdBy.name}{/if}
								{#if set.exportName}· {set.exportName}{/if}
							</p>
							{#if changes(set)}
								<p class="truncate text-xs text-base-content/80">{changes(set)}</p>
							{/if}
						</div>
						{#if canUndo(set)}
							<button
								type="button"
								class={["btn btn-sm", confirming === set.id && "btn-warning"]}
								title={undoHint(set)}
								onclick={() => restore(set)}
							>
								{confirming === set.id ? "Really undo?" : "Undo"}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
