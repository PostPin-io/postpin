<script lang="ts">
	import {
		createCategory,
		getCategories,
		getMarkers,
		changeCategoryColor,
		deleteCategory,
		getCategoryUsage,
		renameCategory,
	} from "../review/markers/markers.remote";
	import { page } from "$app/state";
	import ColorPicker from "./ColorPicker.svelte";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Check from "@lucide/svelte/icons/check";
	import Trash from "@lucide/svelte/icons/trash";
	import { hueyColor } from "@hueycolor/svelte";
	let dialog: HTMLDialogElement;
	let usedCategoryWarning: HTMLDialogElement;

	let newCategoryName = $state("");

	let projectId = $derived(page.params.project ?? "");
	let categories = $derived(await getCategories(projectId));
	let pendingColors: Record<string, string> = $state({});

	let search = $state("");
	let filtered = $derived(
		categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
	);

	let targetCategoryId = $state("");
	let sourceCategoryId = $state("");

	let isRenaming: string | null = $state(null);
	// Not bound to the category itself: that would change the name the draft is compared with
	let renameDraft = $state("");

	/** Error message in the main dialog (e.g., “Category contains foreign markers”) */
	let deleteError = $state("");
	/** Error message in the merge dialog */
	let mergeError = $state("");

	const randomColor = () => "#" + hueyColor("#ffffff").randomize().toHex();

	async function saveColor(category: { id: string; color: string }) {
		const color = pendingColors[category.id];
		if (!color || color.toLowerCase() === category.color.toLowerCase()) return;
		await changeCategoryColor({ id: category.id, color });

		await Promise.all([
			getCategories(projectId).refresh(),
			getMarkers(page.params.export ?? "").refresh(),
		]);

		delete pendingColors[category.id];
	}

	export function open(projectIdParam: string) {
		projectId = projectIdParam;
		search = "";
		deleteError = "";
		dialog?.showModal();
	}

	function openMergeDialog(id: string) {
		sourceCategoryId = id;
		targetCategoryId = "";
		mergeError = "";
		usedCategoryWarning?.showModal();
	}

	async function removeCategory(id: string) {
		if (!categories.find((c) => c.id === id)?.canDelete) return;
		deleteError = "";
		const usage = await getCategoryUsage(id);

		if (usage.total === 0) {
			const res = await deleteCategory({ id });

			if (!res.success && res.reason === "CATEGORY_IN_USE") openMergeDialog(id);
			// deleteCategory refresht getCategories selbst
			return;
		}

		if (!usage.canMoveForeign && usage.foreign > 0) {
			deleteError = "This category contains markers from other users and can't be deleted.";
			return;
		}

		openMergeDialog(id);
	}

	async function mergeAndDelete() {
		mergeError = "";
		const res = await deleteCategory({
			id: sourceCategoryId,
			mergeIntoId: targetCategoryId,
			exportId: page.params.export,
		});

		if (!res.success) {
			mergeError =
				res.reason === "HAS_FOREIGN_MARKERS"
					? "This category contains markers from other users and can't be deleted."
					: "New markers were added in the meantime. Please try again.";
			return;
		}

		usedCategoryWarning?.close();
	}

	async function addCategory(event: SubmitEvent) {
		event.preventDefault();
		if (newCategoryName.trim() === "") return;
		await createCategory({
			name: newCategoryName.trim(),
			color: randomColor(),
			projectId,
		});
		await getCategories(projectId).refresh();
		newCategoryName = "";
	}
	/** Blur and the confirm button both end up here; only the first one renames */
	async function commitRename(id: string) {
		if (isRenaming !== id) return;
		isRenaming = null;
		const category = categories.find((c) => c.id === id);
		const name = renameDraft.trim();
		if (!category?.canUpdate || name === "" || name === category.name) return;
		// renameCategory refreshes the categories and this export's markers itself
		await renameCategory({ id, name, exportId: page.params.export });
	}
</script>

<!-- Main Categories Dialog -->
<dialog class="modal" bind:this={dialog}>
	<div class="modal-box flex max-h-[80vh] flex-col gap-4">
		<h2 class="text-lg font-bold">Categories</h2>

		<input
			type="search"
			class="input w-full input-sm"
			placeholder="Search categories"
			aria-label="Search categories"
			bind:value={search}
		/>

		{#if deleteError}
			<div role="alert" class="alert alert-soft py-2 text-sm alert-warning">
				{deleteError}
			</div>
		{/if}

		<ul class="list min-h-0 flex-1 overflow-y-auto rounded-box border border-base-300">
			{#each filtered as category (category.id)}
				<li class="list-row items-center">
					{@render popupColorPicker(category)}
					{#if isRenaming === category.id}
						<input
							type="text"
							class="input input-sm"
							bind:value={renameDraft}
							onblur={() => commitRename(category.id)}
							onkeydown={(e) => {
								if (e.key === "Enter") commitRename(category.id);
								else if (e.key === "Escape") {
									// not the dialog's "close on Escape"
									e.preventDefault();
									isRenaming = null;
								}
							}}
						/>

						<button
							type="button"
							class="btn btn-square btn-ghost btn-sm"
							aria-label="Confirm renaming"
							onclick={() => commitRename(category.id)}
						>
							<Check class="size-[1.1em]" />
						</button>
					{/if}
					{#if isRenaming !== category.id}
						<span class="truncate">{category.name}</span>
						{#if category.canDelete}
							<button
								type="button"
								class="btn btn-square btn-ghost btn-sm"
								aria-label="Delete category"
								onclick={() => removeCategory(category.id)}
							>
								<Trash class="size-[1.1em]" />
							</button>
						{/if}
						{#if category.canUpdate}
							<button
								type="button"
								class="btn btn-square btn-ghost btn-sm"
								title="rename category"
								onclick={() => {
									renameDraft = category.name;
									isRenaming = category.id;
								}}
							>
								<Pencil class="size-[1.1em]" />
							</button>
						{/if}
					{/if}
				</li>
			{:else}
				<li class="p-4 text-center text-sm opacity-60">
					{search.trim() ? "No categories found" : "No categories yet"}
				</li>
			{/each}
		</ul>

		<form class="join w-full" onsubmit={addCategory}>
			<input
				type="text"
				class="input join-item min-w-0 flex-1"
				placeholder="New category name"
				aria-label="New category name"
				bind:value={newCategoryName}
			/>
			<button
				type="submit"
				class="btn join-item btn-primary"
				disabled={newCategoryName.trim() === ""}
			>
				Add
			</button>
		</form>

		<div class="modal-action mt-0">
			<form method="dialog">
				<button class="btn">Close</button>
			</form>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Category In-Use Warning Dialog -->
<dialog class="modal" bind:this={usedCategoryWarning}>
	<div class="modal-box">
		{@render popupDelUsedCategory()}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

{#snippet popupColorPicker(category: (typeof categories)[number])}
	<button
		type="button"
		class="h-6 w-10 shrink-0 cursor-pointer rounded-sm border border-base-content/20 p-0"
		popovertarget="category-menu-{category.id}"
		style="anchor-name: --category-anchor-{category.id}"
		style:background-color={category.color}
		aria-label="Choose category color"
		disabled={!category.canUpdate}
	></button>

	<ul
		id="category-menu-{category.id}"
		popover
		class="dropdown z-50 max-h-none w-fit overflow-visible rounded-box bg-base-100 p-2 shadow-lg"
		style="position-anchor: --category-anchor-{category.id}"
		ontoggle={(event) => {
			if ((event as ToggleEvent).newState === "closed") saveColor(category);
		}}
	>
		<li class="list-none">
			<ColorPicker
				value={pendingColors[category.id] ?? category.color}
				onchange={(hex) => (pendingColors[category.id] = hex)}
			/>
		</li>
	</ul>
{/snippet}

{#snippet popupDelUsedCategory()}
	<div class="space-y-5">
		<div class="space-y-1">
			<h3 class="text-lg font-bold">Category in Use</h3>
			<p class="text-sm text-base-content/70">
				This category is assigned to existing markers and can't be deleted yet. Choose another
				category: all markers will be moved to the selected category and this category will be
				deleted.
			</p>
		</div>

		<!-- Destination category + primary action -->
		<fieldset class="fieldset w-full">
			<legend class="fieldset-legend">Merge markers into</legend>

			<div class="flex items-end gap-3">
				<select
					id="target-category"
					class="select-bordered select min-w-0 flex-1"
					bind:value={targetCategoryId}
				>
					<option value="" disabled>Select a destination category</option>

					{#each categories.filter((c) => c.id !== sourceCategoryId) as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>

				<button
					type="button"
					class="btn shrink-0 btn-primary"
					disabled={!targetCategoryId || targetCategoryId === sourceCategoryId}
					onclick={mergeAndDelete}
				>
					Merge &amp; delete
				</button>
			</div>

			<p class="mt-1 text-xs text-base-content/60">
				All markers in this category will be reassigned to the selected category, then this category
				is deleted.
			</p>

			{#if mergeError}
				<p role="alert" class="mt-2 text-sm text-error">{mergeError}</p>
			{/if}
		</fieldset>

		<!-- Secondary actions -->
		<div class="modal-action mt-4 flex justify-end gap-2">
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				onclick={() => usedCategoryWarning?.close()}
			>
				Cancel
			</button>

			<button
				type="button"
				class="btn btn-outline btn-sm"
				onclick={() => usedCategoryWarning?.close()}
			>
				Close
			</button>
		</div>
	</div>
{/snippet}
