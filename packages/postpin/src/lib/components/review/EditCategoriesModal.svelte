<script lang="ts">
	import {
		createCategory,
		getCategories,
		getMarkers,
		changeCategoryColor,
		deleteCategory,
	} from "./MarkerPanel.remote";
	import { page } from "$app/state";
	import ColorPicker from "../ColorPicker.svelte";
	import CircleDashed from "@lucide/svelte/icons/circle-dashed";
	import Trash from "@lucide/svelte/icons/trash";

	let dialog: HTMLDialogElement;

	let newCategoryName = $state("");

	let projectId = $derived(page.params.project ?? "");
	let categories = $derived(await getCategories(projectId));
	let pendingColors: Record<string, string> = $state({});

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
		dialog?.showModal();
	}

	async function removeCategory(id: string) {
		await deleteCategory(id);
		await getCategories(projectId).refresh();
	}

	async function addCategory(event: SubmitEvent) {
		event.preventDefault();
		if (newCategoryName.trim() === "") return;
		await createCategory({
			name: newCategoryName.trim(),
			color: "#ffffff",
			projectId,
		});
		await getCategories(projectId).refresh();
		newCategoryName = "";
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box flex max-h-[80vh] flex-col gap-4">
		<h2 class="text-lg font-bold">Categories</h2>

		<ul class="list min-h-0 flex-1 overflow-y-auto rounded-box border border-base-300">
			{#each categories as category (category.id)}
				<li class="list-row items-center">
					{@render popupColorPicker(category)}
					<span class="truncate">{category.name}</span>
					<button
						type="button"
						class="btn btn-square btn-ghost btn-sm"
						aria-label="Delete category"
						onclick={() => removeCategory(category.id)}
					>
						<Trash class="size-[1.1em]" />
					</button>
					<button
						type="button"
						class="btn btn-square btn-ghost btn-sm"
						aria-label="Category options"
					>
						<CircleDashed class="size-[1.1em]" />
					</button>
				</li>
			{:else}
				<li class="p-4 text-center text-sm opacity-60">No categories yet</li>
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

{#snippet popupColorPicker(category: (typeof categories)[number])}
	<button
		type="button"
		class="h-6 w-10 shrink-0 cursor-pointer rounded-sm border border-base-content/20 p-0"
		popovertarget="category-menu-{category.id}"
		style="anchor-name: --category-anchor-{category.id}"
		style:background-color={category.color}
		aria-label="Choose category color"
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
