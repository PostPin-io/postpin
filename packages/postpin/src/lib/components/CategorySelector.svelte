<script lang="ts">
	import { page } from "$app/state";
	import { getCategories } from "./review/MarkerPanel.remote";
	import CategoryBadge from "./review/CategoryBadge.svelte";

	interface Props {
		value?: string;
		onselect?: (categoryId: string) => void;
	}
	let { value, onselect }: Props = $props();

	let categories = $derived(await getCategories(page.params.project ?? ""));
	let selected = $derived(categories.find((c) => c.id === value));
	let search = $state("");
	let filtered = $derived(
		categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
	);

	function select(id: string) {
		onselect?.(id);
		search = "";
		(document.activeElement as HTMLElement | null)?.blur();
	}
</script>

<div class="dropdown dropdown-center">
	<div tabindex="0" role="button" class="btn min-w-32 justify-start">
		{#if selected}
			<CategoryBadge category={selected} />
		{:else}
			<span class="opacity-60">Select category</span>
		{/if}
	</div>
	<div class="dropdown-content z-10 mt-1 w-64 rounded-box bg-base-100 shadow">
		<div class="flex flex-col gap-2 p-2">
			<input
				type="search"
				class="input w-full input-sm"
				placeholder="Search categories"
				bind:value={search}
			/>
			<ul class="flex max-h-60 flex-col gap-1 overflow-y-auto">
				{#each filtered as category (category.id)}
					<li>
						<button
							type="button"
							class="btn w-full justify-start btn-ghost btn-sm"
							onclick={() => select(category.id)}
						>
							<CategoryBadge {category} />
						</button>
					</li>
				{:else}
					<li class="px-2 text-xs opacity-60">No categories found</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
