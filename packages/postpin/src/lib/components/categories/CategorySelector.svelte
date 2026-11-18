<script lang="ts">
	import { page } from "$app/state";
	import { getCategories } from "../review/markers/markers.remote";
	import CategoryBadge from "./CategoryBadge.svelte";

	interface Props {
		value?: string;
		onselect?: (categoryId: string) => void;
		readonly?: boolean;
		/** Show the selected category as its color dot only */
		collapsed?: boolean;
		/** Widths of the expanded and the collapsed look, whichever is showing; lets the parent decide */
		widths?: { expanded: number; collapsed: number };
	}
	let {
		value,
		onselect,
		readonly,
		collapsed = false,
		widths = $bindable({ expanded: 0, collapsed: 0 }),
	}: Props = $props();

	// Both looks, rendered invisibly out of the flow to measure them
	let expandedWidth = $state(0);
	let collapsedWidth = $state(0);
	$effect(() => {
		widths = { expanded: expandedWidth, collapsed: collapsedWidth };
	});

	let categories = $derived(await getCategories(page.params.project ?? ""));
	let selected = $derived(categories.find((c) => c.id === value));
	let search = $state("");
	let filtered = $derived(
		categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
	);

	// A popover lives in the top layer, so the marker card's scroll container can't clip it
	const uid = $props.id();
	let popover = $state<HTMLElement>();

	function select(id: string) {
		onselect?.(id);
		search = "";
		popover?.hidePopover();
	}
</script>

{#if !readonly}
	<div class="min-w-0">
		<button
			type="button"
			popovertarget="category-{uid}"
			style:anchor-name="--category-{uid}"
			class="btn max-w-full flex-nowrap justify-start {collapsed && selected
				? 'px-3'
				: 'max-w-56 min-w-32'}"
			aria-label={selected ? `Category: ${selected.name}` : undefined}
		>
			{@render trigger(collapsed)}
		</button>
		<span class="measure" aria-hidden="true">
			<span
				class="btn max-w-56 min-w-32 flex-nowrap justify-start"
				bind:offsetWidth={expandedWidth}
			>
				{@render trigger(false)}
			</span>
			<span class="btn flex-nowrap px-3" bind:offsetWidth={collapsedWidth}>
				{@render trigger(true)}
			</span>
		</span>
		<div
			bind:this={popover}
			id="category-{uid}"
			popover="auto"
			style:position-anchor="--category-{uid}"
			class="category-popover m-0 w-64 max-w-[calc(100vw-1rem)] rounded-box bg-base-100 p-0 text-base-content shadow"
		>
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
{:else if selected}
	<span class="flex min-w-0">
		<CategoryBadge category={selected} {collapsed} />
		<span class="measure" aria-hidden="true">
			<span bind:offsetWidth={expandedWidth}><CategoryBadge category={selected} /></span>
			<span bind:offsetWidth={collapsedWidth}><CategoryBadge category={selected} collapsed /></span>
		</span>
	</span>
{:else}
	<span class="opacity-60">No category</span>
{/if}

{#snippet trigger(dot: boolean)}
	{#if selected}
		<CategoryBadge category={selected} collapsed={dot} />
	{:else}
		<span class="opacity-60">Select category</span>
	{/if}
{/snippet}

<style>
	/* Out of the flow and unseen, but laid out, so it has a width */
	.measure {
		position: fixed;
		top: 0;
		left: 0;
		display: flex;
		visibility: hidden;
		pointer-events: none;
	}
	/* Below the button, left-aligned to it, kept inside the viewport */
	.category-popover {
		position: fixed;
		inset: auto;
		top: anchor(bottom);
		left: anchor(left);
		margin-top: 0.25rem;
		position-try-fallbacks: flip-block, flip-inline;
	}
</style>
