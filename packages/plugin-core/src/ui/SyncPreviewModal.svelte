<script module lang="ts">
	import type { SyncMode } from "../sync";

	export interface PreviewAnswer {
		apply: boolean;
		/** keys of the rows to apply (DiffRow.key) */
		selected: Set<string>;
	}

	// The mode the user picked last, for the next preview while the plugin runs
	let lastMode: SyncMode = "add";
</script>

<script lang="ts">
	import Minus from "@lucide/svelte/icons/minus";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Plus from "@lucide/svelte/icons/plus";
	import { formatTimecode } from "@postpin-io/shared/logic/timecode";
	import { selectionFor, type DiffRow, type SyncPreview } from "../sync";
	import HostLogo from "./HostLogo.svelte";
	import { hostInfo } from "./hosts";
	import PostPinLogo from "./PostPinLogo.svelte";

	// A compact diff of what a sync changes on its target, before it runs. Two modes: "Add & update"
	// writes the new and changed markers, "Match" makes the target exactly like the source, which
	// also deletes and brings back deleted markers. Left: what comes in (+, ✎), right: what goes
	// away (−), one line per marker sorted by timecode. Clicking a line includes or leaves out that
	// marker. show() resolves with the answer; closing the dialog cancels.
	let dialog: HTMLDialogElement | null = null;
	let preview = $state<SyncPreview | null>(null);
	let mode = $state<SyncMode>("add");
	let selected = $state<Set<string>>(new Set());
	let resolve: ((answer: PreviewAnswer) => void) | null = null;

	export function show(p: SyncPreview): Promise<PreviewAnswer> {
		preview = p;
		setMode(p.removals.length + p.restores.length ? lastMode : "add");
		dialog?.showModal();
		return new Promise((r) => (resolve = r));
	}

	function setMode(next: SyncMode) {
		mode = next;
		if (preview) selected = selectionFor(preview, next);
	}

	function toggle(row: DiffRow) {
		const next = new Set(selected);
		if (!next.delete(row.key)) next.add(row.key);
		selected = next;
	}

	function answer(apply: boolean) {
		if (apply && preview && preview.removals.length + preview.restores.length) lastMode = mode;
		resolve?.({ apply, selected: apply ? selected : new Set() });
		resolve = null;
		dialog?.close();
	}

	const hostLabel = $derived(preview ? hostInfo(preview.hostName).displayName : "");
	const targetLabel = $derived(preview?.target === "nle" ? hostLabel : "PostPin");
	const sourceLabel = $derived(preview?.target === "nle" ? "PostPin" : hostLabel);
	// The modes only differ when something was deleted on one side
	const hasModes = $derived(!!preview && preview.removals.length + preview.restores.length > 0);
	const lines = $derived(
		preview
			? [...preview.rows, ...preview.restores, ...preview.removals].toSorted(
					(a, b) => a.frame - b.frame,
				)
			: [],
	);
	const incoming = $derived(lines.filter((r) => r.kind !== "remove"));
	const writing = $derived(incoming.filter((r) => selected.has(r.key)).length);
	const deleting = $derived(lines.filter((r) => r.kind === "remove" && selected.has(r.key)).length);
	const applyLabel = $derived(
		writing && deleting
			? `Apply ${writing} · delete ${deleting}`
			: deleting
				? `Delete ${deleting}`
				: `Apply ${writing}`,
	);

	function timecode(frame: number) {
		if (!preview?.frameRate) return String(frame);
		return formatTimecode(frame, preview.frameRate);
	}

	function tooltip(row: DiffRow) {
		const what = selected.has(row.key) ? "Click to leave it out" : "Click to include it";
		return [...row.changes, what].join("\n");
	}
</script>

{#snippet cell(row: DiffRow)}
	{@const on = selected.has(row.key)}
	<button
		type="button"
		class={[
			"flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left hover:brightness-125",
			row.kind === "remove"
				? "bg-error/10"
				: row.kind === "update"
					? "bg-warning/10"
					: "bg-success/10",
			!on && "opacity-35",
		]}
		aria-pressed={on}
		title={tooltip(row)}
		onclick={() => toggle(row)}
	>
		{#if row.kind === "remove"}
			<Minus class="size-3 shrink-0 text-error" strokeWidth={3} aria-label="deleted" />
		{:else if row.kind === "update"}
			<Pencil class="size-3 shrink-0 text-warning" aria-label="changed" />
		{:else}
			<Plus class="size-3 shrink-0 text-success" strokeWidth={3} aria-label="new" />
		{/if}
		<span class="shrink-0 font-mono text-base-content/60">{timecode(row.frame)}</span>
		<span class={["truncate", row.kind === "remove" && on && "line-through"]}>
			{row.name || "Untitled"}
		</span>
		{#if row.kind === "restore"}
			<span class="badge badge-ghost badge-xs shrink-0">was deleted</span>
		{/if}
	</button>
{/snippet}

<dialog class="modal" bind:this={dialog} onclose={() => answer(false)}>
	<div class="modal-box flex max-h-[80vh] max-w-md flex-col gap-2 p-4 text-xs">
		{#if preview}
			<div class="flex items-center gap-2">
				{#if preview.target === "nle"}
					<HostLogo hostName={preview.hostName} class="size-6 shrink-0" />
				{:else}
					<PostPinLogo class="h-5 w-6 shrink-0" />
				{/if}
				<h3 class="text-sm font-bold">To {targetLabel}</h3>
			</div>

			{#if hasModes}
				<div role="tablist" class="tabs tabs-box tabs-sm grid grid-cols-2">
					<button
						type="button"
						role="tab"
						class={["tab", mode === "add" && "tab-active"]}
						aria-selected={mode === "add"}
						onclick={() => setMode("add")}
					>
						Add & update
					</button>
					<button
						type="button"
						role="tab"
						class={["tab", mode === "match" && "tab-active"]}
						aria-selected={mode === "match"}
						onclick={() => setMode("match")}
					>
						Match
					</button>
				</div>
				<p class="text-base-content/60">
					{mode === "add"
						? "New and changed markers, nothing is deleted."
						: `${targetLabel} becomes exactly like ${sourceLabel}: also deletes, and brings back what was deleted.`}
				</p>
			{/if}

			<div class="grid grid-cols-2 gap-x-2 border-b border-base-content/10 pb-1 font-semibold">
				<span class="text-base-content/70">Added / changed ({incoming.length})</span>
				<span class="text-base-content/70">Deleted ({preview.removals.length})</span>
			</div>

			<div class="grid min-h-0 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto">
				{#each lines as row (row.key)}
					{#if row.kind === "remove"}
						<div></div>
						{@render cell(row)}
					{:else}
						{@render cell(row)}
						<div></div>
					{/if}
				{/each}
			</div>

			{#each preview.notes as note, i (i)}
				<p class="text-base-content/60">{note}</p>
			{/each}

			<div class="flex items-center justify-end gap-2 pt-1">
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => answer(false)}>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={writing + deleting === 0}
					onclick={() => answer(true)}
				>
					{applyLabel}
				</button>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
