<script lang="ts">
	import {
		createCategory,
		getCategories,
		getMarkers,
		changeCategoryColor,
		deleteCategory,
		getCategoryUsage,
		renameCategory,
		deleteUnusedCategories,
	} from "../review/markers/markers.remote";
	import { page } from "$app/state";
	import ColorPicker from "./ColorPicker.svelte";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Check from "@lucide/svelte/icons/check";
	import Trash from "@lucide/svelte/icons/trash";
	import ListPlus from "@lucide/svelte/icons/list-plus";
	import { hueyColor } from "@hueycolor/svelte";
	import { saveCategoryPreset } from "./category-presets.remote";
	import CategoryPresetsModal from "./CategoryPresetsModal.svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { isHttpError } from "@sveltejs/kit";
	let dialog: HTMLDialogElement;
	let usedCategoryWarning: HTMLDialogElement;
	let unusedWarning: HTMLDialogElement;
	let presetsModal: CategoryPresetsModal;
	let presetNameDialog: HTMLDialogElement;

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

	/** What the last preset or cleanup did, e.g. "Added 8 categories" */
	let notice = $state("");
	let busy = $state(false);

	// Only those the user may delete: the others stay, whatever the button says
	let unused = $derived(categories.filter((c) => c.unused && c.canDelete));

	const plural = (n: number) => `${n} ${n === 1 ? "category" : "categories"}`;

	function presetApplied({ created, skipped }: { created: number; skipped: number }) {
		deleteError = "";
		notice = `Added ${plural(created)}` + (skipped > 0 ? `, ${skipped} already existed` : "") + ".";
	}

	// ─── Saving a preset: pick categories here, then name it ───
	let selecting = $state(false);
	const picked = new SvelteSet<string>();
	let presetName = $state("");
	let presetError = $state("");

	function startSelecting() {
		picked.clear();
		search = "";
		notice = "";
		deleteError = "";
		isRenaming = null;
		selecting = true;
	}

	function toggle(id: string) {
		if (!picked.delete(id)) picked.add(id);
	}

	function toggleAll() {
		const all = filtered.every((c) => picked.has(c.id));
		for (const c of filtered) {
			if (all) picked.delete(c.id);
			else picked.add(c.id);
		}
	}

	function askPresetName() {
		presetName = "";
		presetError = "";
		presetNameDialog?.showModal();
	}

	async function savePreset(event: SubmitEvent) {
		event.preventDefault();
		const name = presetName.trim();
		if (name === "" || picked.size === 0) return;
		presetError = "";
		busy = true;
		try {
			await saveCategoryPreset({ projectId, name, categoryIds: [...picked] });
			notice = `Saved preset "${name}" with ${plural(picked.size)}.`;
			selecting = false;
			presetNameDialog?.close();
		} catch (e) {
			presetError =
				isHttpError(e) && e.status === 409
					? `A preset named "${name}" already exists.`
					: "The preset couldn't be saved. Please try again.";
		} finally {
			busy = false;
		}
	}

	async function removeUnused() {
		deleteError = "";
		busy = true;
		try {
			const { count } = await deleteUnusedCategories({ projectId });
			notice = `Deleted ${plural(count)}.`;
		} catch {
			notice = "";
			deleteError = "The unused categories couldn't be deleted. Please try again.";
		} finally {
			busy = false;
			unusedWarning?.close();
		}
	}

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
		notice = "";
		selecting = false;
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
<dialog class="modal modal-bottom sm:modal-middle" bind:this={dialog}>
	<!-- Same fixed size as the presets dialog: the list scrolls, the dialog doesn't resize.
	     A bottom sheet on phones. -->
	<div
		class="modal-box flex h-[92dvh] w-full max-w-4xl flex-col gap-3 p-4 sm:h-[85vh] sm:gap-4 sm:p-6"
	>
		<h2 class="text-lg font-bold">{selecting ? "New preset" : "Categories"}</h2>
		{#if selecting}
			<p class="-mt-2 text-sm text-base-content/70">
				Select the categories the preset should contain.
			</p>
		{/if}

		<input
			type="search"
			class="input w-full text-base sm:text-sm sm:input-sm"
			placeholder="Search categories"
			aria-label="Search categories"
			bind:value={search}
		/>

		{#if deleteError}
			<div role="alert" class="alert alert-soft py-2 text-sm alert-warning">
				{deleteError}
			</div>
		{:else if notice}
			<div role="status" class="alert alert-soft py-2 text-sm alert-success">
				{notice}
			</div>
		{/if}

		<ul class="list min-h-0 flex-1 overflow-y-auto rounded-box border border-base-300">
			{#each filtered as category (category.id)}
				{#if selecting}
					<li class="list-row items-center p-0">
						<label
							class="flex cursor-pointer items-center gap-3 px-3 py-2.5 list-col-grow sm:py-1.5"
						>
							<input
								type="checkbox"
								class="checkbox checkbox-md sm:checkbox-sm"
								checked={picked.has(category.id)}
								onchange={() => toggle(category.id)}
							/>
							<span
								class="h-5 w-8 shrink-0 rounded-sm border border-base-content/20"
								style:background-color={category.color}
							></span>
							<span class="truncate">{category.name}</span>
						</label>
					</li>
				{:else}
					<li class="list-row items-center gap-2 px-3 py-1.5 sm:gap-3">
						{@render popupColorPicker(category)}
						{#if isRenaming === category.id}
							<input
								type="text"
								class="input min-w-0 text-base input-sm sm:text-sm sm:input-xs"
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
								class="btn btn-square btn-ghost btn-sm sm:btn-xs"
								aria-label="Confirm renaming"
								onclick={() => commitRename(category.id)}
							>
								<Check class="size-[1.1em]" />
							</button>
						{/if}
						{#if isRenaming !== category.id}
							<span class="min-w-0 truncate">{category.name}</span>
							{#if category.canDelete}
								<button
									type="button"
									class="btn btn-square btn-ghost btn-sm sm:btn-xs"
									aria-label="Delete category"
									onclick={() => removeCategory(category.id)}
								>
									<Trash class="size-[1.1em]" />
								</button>
							{/if}
							{#if category.canUpdate}
								<button
									type="button"
									class="btn btn-square btn-ghost btn-sm sm:btn-xs"
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
				{/if}
			{:else}
				<li class="p-4 text-center text-sm opacity-60">
					{search.trim() ? "No categories found" : "No categories yet"}
				</li>
			{/each}
		</ul>

		{#if selecting}
			<div class="modal-action mt-0 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
				<button
					type="button"
					class="btn col-span-2 btn-ghost sm:col-span-1"
					disabled={filtered.length === 0}
					onclick={toggleAll}
				>
					{filtered.length > 0 && filtered.every((c) => picked.has(c.id))
						? "Deselect all"
						: "Select all"}
				</button>
				<div class="col-span-2 grid grid-cols-2 gap-2 sm:flex">
					<button type="button" class="btn" onclick={() => (selecting = false)}>Cancel</button>
					<button
						type="button"
						class="btn btn-primary"
						disabled={picked.size === 0}
						onclick={askPresetName}
					>
						Save{picked.size > 0 ? ` (${picked.size})` : ""}
					</button>
				</div>
			</div>
		{:else}
			<form class="join w-full" onsubmit={addCategory}>
				<input
					type="text"
					class="input join-item min-w-0 flex-1 text-base sm:text-sm"
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

			<div class="modal-action mt-0 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
				<div class="col-span-2 grid grid-cols-2 gap-2 sm:flex">
					<button type="button" class="btn" disabled={busy} onclick={() => presetsModal?.open()}>
						<ListPlus class="size-[1.1em]" />
						Presets
					</button>
					<button
						type="button"
						class="btn"
						disabled={busy || unused.length === 0}
						title={unused.length === 0 ? "Every category has markers" : undefined}
						onclick={() => unusedWarning?.showModal()}
					>
						<Trash class="size-[1.1em]" />
						<span class="hidden sm:inline">Delete unused</span>
						<span class="sm:hidden">Unused</span>
						{unused.length > 0 ? `(${unused.length})` : ""}
					</button>
				</div>
				<form method="dialog" class="col-span-2">
					<button class="btn w-full sm:w-auto">Close</button>
				</form>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<CategoryPresetsModal
	bind:this={presetsModal}
	{projectId}
	existingNames={categories.map((c) => c.name)}
	onapplied={presetApplied}
	oncreate={startSelecting}
/>

<!-- Preset Name Dialog -->
<dialog class="modal modal-bottom sm:modal-middle" bind:this={presetNameDialog}>
	<form class="modal-box space-y-4" onsubmit={savePreset}>
		<h3 class="text-lg font-bold">Save preset</h3>
		<p class="text-sm text-base-content/70">
			{plural(picked.size)} will be saved as a preset of your organization, to reuse in any project.
		</p>
		<input
			type="text"
			class="input w-full text-base sm:text-sm"
			placeholder="Preset name"
			aria-label="Preset name"
			maxlength="60"
			bind:value={presetName}
		/>
		{#if presetError}
			<p role="alert" class="text-sm text-error">{presetError}</p>
		{/if}
		<div class="modal-action">
			<button type="button" class="btn btn-ghost" onclick={() => presetNameDialog?.close()}>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={busy || presetName.trim() === ""}>
				Save preset
			</button>
		</div>
	</form>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Category In-Use Warning Dialog -->
<dialog class="modal modal-bottom sm:modal-middle" bind:this={usedCategoryWarning}>
	<div class="modal-box">
		{@render popupDelUsedCategory()}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Delete Unused Categories Dialog -->
<dialog class="modal modal-bottom sm:modal-middle" bind:this={unusedWarning}>
	<div class="modal-box space-y-4">
		<h3 class="text-lg font-bold">Delete unused categories?</h3>
		<p class="text-sm text-base-content/70">
			{unused.length === 1 ? "This category has" : `These ${unused.length} categories have`} no markers
			in this project and will be deleted:
		</p>
		<ul class="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
			{#each unused as category (category.id)}
				<li class="badge gap-1.5 badge-outline">
					<span class="size-2.5 rounded-full" style:background-color={category.color}></span>
					{category.name}
				</li>
			{/each}
		</ul>
		<div class="modal-action">
			<button type="button" class="btn btn-ghost" onclick={() => unusedWarning?.close()}>
				Cancel
			</button>
			<button type="button" class="btn btn-error" disabled={busy} onclick={removeUnused}>
				Delete {plural(unused.length)}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

{#snippet popupColorPicker(category: (typeof categories)[number])}
	<button
		type="button"
		class="h-7 w-9 shrink-0 cursor-pointer rounded-sm border border-base-content/20 p-0 sm:h-5 sm:w-8"
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
