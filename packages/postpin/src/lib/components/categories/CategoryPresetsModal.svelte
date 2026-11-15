<script lang="ts">
	import {
		applyCategoryPreset,
		deleteCategoryPreset,
		getCategoryPresets,
	} from "./category-presets.remote";
	import Trash from "@lucide/svelte/icons/trash";
	import Plus from "@lucide/svelte/icons/plus";
	import Check from "@lucide/svelte/icons/check";

	let {
		projectId,
		existingNames,
		onapplied,
		oncreate,
	}: {
		projectId: string;
		/** Names of the project's categories: those a preset wouldn't add again */
		existingNames: string[];
		onapplied: (result: { created: number; skipped: number }) => void;
		/** The user wants to save a preset of their own: the categories modal lets them pick */
		oncreate: () => void;
	} = $props();

	let dialog: HTMLDialogElement;

	let { presets, canCreate } = $derived(await getCategoryPresets(projectId));
	let selectedId = $state("postpin");
	// A deleted preset falls back to the first one
	let selected = $derived(presets.find((p) => p.id === selectedId) ?? presets[0]);

	let existing = $derived(new Set(existingNames));
	let missing = $derived(selected?.categories.filter((c) => !existing.has(c.name)).length ?? 0);

	let busy = $state(false);
	let errorMessage = $state("");
	/** Id of the preset whose deletion waits for a second click */
	let confirmDelete: string | null = $state(null);

	export function open() {
		errorMessage = "";
		confirmDelete = null;
		dialog?.showModal();
	}

	function select(id: string) {
		selectedId = id;
		confirmDelete = null;
		errorMessage = "";
	}

	async function apply() {
		if (!selected) return;
		errorMessage = "";
		busy = true;
		try {
			// refreshes the project's categories itself
			onapplied(await applyCategoryPreset({ projectId, preset: selected.id }));
			dialog?.close();
		} catch {
			errorMessage = "The preset couldn't be added. Please try again.";
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!selected?.canDelete) return;
		if (confirmDelete !== selected.id) {
			confirmDelete = selected.id;
			return;
		}
		errorMessage = "";
		busy = true;
		try {
			await deleteCategoryPreset({ projectId, id: selected.id });
		} catch {
			errorMessage = "The preset couldn't be deleted. Please try again.";
		} finally {
			busy = false;
			confirmDelete = null;
		}
	}
</script>

<dialog class="modal modal-bottom sm:modal-middle" bind:this={dialog}>
	<!-- Fixed size: switching presets must not resize the dialog, the lists scroll instead.
	     A bottom sheet on phones. -->
	<div
		class="modal-box flex h-[92dvh] w-full max-w-4xl flex-col gap-3 p-4 sm:h-[85vh] sm:gap-4 sm:p-6"
	>
		<h2 class="text-lg font-bold">Category presets</h2>

		{#if errorMessage}
			<div role="alert" class="alert alert-soft py-2 text-sm alert-warning">{errorMessage}</div>
		{/if}

		<!-- Phones: a native picker instead of the list, so the categories keep the height -->
		<div class="flex gap-2 sm:hidden">
			<select
				class="select min-w-0 flex-1 text-base"
				aria-label="Preset"
				value={selected?.id}
				onchange={(e) => select(e.currentTarget.value)}
			>
				{#each [true, false] as builtIn (builtIn)}
					{@const group = presets.filter((p) => p.builtIn === builtIn)}
					{#if group.length > 0}
						<optgroup label={builtIn ? "Built-in" : "Your organization"}>
							{#each group as preset (preset.id)}
								<option value={preset.id}>
									{preset.name} ({preset.categories.length})
								</option>
							{/each}
						</optgroup>
					{/if}
				{/each}
			</select>
			{#if canCreate}
				<button
					type="button"
					class="btn btn-square"
					aria-label="New preset"
					onclick={() => {
						dialog?.close();
						oncreate();
					}}
				>
					<Plus class="size-[1.1em]" />
				</button>
			{/if}
		</div>

		<div class="grid min-h-0 flex-1 gap-3 sm:grid-cols-[16rem_minmax(0,1fr)]">
			<!-- Left: every preset -->
			<div
				class="hidden min-h-0 flex-col overflow-y-auto rounded-box border border-base-300 sm:flex"
			>
				<ul class="menu w-full flex-nowrap p-1">
					{#each presets as preset, i (preset.id)}
						{#if i === 0 || preset.builtIn !== presets[i - 1]?.builtIn}
							<li class="menu-title">{preset.builtIn ? "Built-in" : "Your organization"}</li>
						{/if}
						<li>
							<button
								type="button"
								class:menu-active={preset.id === selected?.id}
								aria-current={preset.id === selected?.id}
								onclick={() => select(preset.id)}
							>
								<span class="truncate">{preset.name}</span>
								<span class="ml-auto text-xs opacity-60">{preset.categories.length}</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if canCreate}
					<div class="mt-auto border-t border-base-300 p-1">
						<button
							type="button"
							class="btn w-full justify-start btn-ghost btn-sm"
							onclick={() => {
								dialog?.close();
								oncreate();
							}}
						>
							<Plus class="size-[1.1em]" />
							New preset
						</button>
					</div>
				{/if}
			</div>

			<!-- Right: the categories of the selected one -->
			<div class="flex min-h-0 flex-col rounded-box border border-base-300">
				{#if selected}
					<div class="flex items-start gap-2 border-b border-base-300 px-3 py-2.5 sm:px-4 sm:py-3">
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-medium">{selected.name}</h3>
							<p class="text-xs text-base-content/60">
								{selected.description ?? "A preset of your organization"}
							</p>
						</div>
						{#if selected.canDelete}
							<button
								type="button"
								class="btn shrink-0 btn-sm {confirmDelete === selected.id
									? 'btn-error'
									: 'btn-square btn-ghost'}"
								aria-label="Delete preset"
								disabled={busy}
								onclick={remove}
							>
								{#if confirmDelete === selected.id}
									Delete preset?
								{:else}
									<Trash class="size-[1.1em]" />
								{/if}
							</button>
						{/if}
					</div>
					<ul class="min-h-0 flex-1 overflow-y-auto px-3 py-1 sm:px-4 sm:py-2">
						{#each selected.categories as category (category.name)}
							{@const exists = existing.has(category.name)}
							<li class="flex items-center gap-3 py-1.5">
								<span
									class="h-4 w-7 shrink-0 rounded-sm border border-base-content/20"
									style:background-color={category.color}
								></span>
								<span class="truncate" class:opacity-50={exists}>{category.name}</span>
								{#if exists}
									<span class="ml-auto flex shrink-0 items-center gap-1 text-xs opacity-50">
										<Check class="size-3" /> in project
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="modal-action mt-0 grid grid-cols-2 gap-2 sm:flex">
			<form method="dialog">
				<button class="btn w-full sm:w-auto">Close</button>
			</form>
			<button
				type="button"
				class="btn btn-primary"
				disabled={busy || missing === 0}
				onclick={apply}
			>
				{missing === 0
					? "All in project"
					: `Add ${missing} ${missing === 1 ? "category" : "categories"}`}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
