<script lang="ts">
	import { page } from "$app/state";
	import { tick } from "svelte";
	import Marker from "./Marker.svelte";
	import UpdateMarker from "./UpdateMarker.svelte";
	import CategoryBadge from "./CategoryBadge.svelte";
	import { markerFilter } from "./markerFilter.svelte.ts";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import { Pane, Splitpanes } from "svelte-splitpanes";

	import {
		getMarkers,
		getMarkersbyCategory,
		getCategories,
		createMarker,
		createCategory,
	} from "./MarkerPanel.remote.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	interface Props {
		currentFrame: number;
		onseek: (frame: number) => void;
		startFrame: number;
		frameRate: FrameRate;
	}
	let { currentFrame, onseek, frameRate, startFrame }: Props = $props();
	let updateMarkerComponent: UpdateMarker | null = null;
	const currentExportId = $derived(page.params.export ?? "");
	const projectId = $derived(page.params.project ?? "");
	const defaultCategory = $derived(localStorage.getItem("DefaultCategory") ?? "");

	let markers = $derived(await getMarkers(currentExportId));
	let markerAtPlayhead = $derived(markers.find((marker) => marker.frame === currentFrame));

	let markersComponents: Marker[] = $state([]);

	let categories = $derived(await getCategories(projectId));
	let filteredMarkers = $derived(markerFilter.apply(markers));
	let selectedMarkerId = $state<string | null>(null);
	let selectedMarker = $derived(markers.find((marker) => marker.id === selectedMarkerId));

	let isUpdateMarkerFocused = $state(false);

	function toggleCollapseAllMarkers() {
		const anyMarkerOpen = markersComponents.some((marker) => marker?.isExpanded());
		if (anyMarkerOpen) {
			markersComponents.forEach((marker) => marker?.collapse());
		} else {
			markersComponents.forEach((marker) => marker?.open());
		}
	}

	// Automatically select the marker at the playhead when it changes
	// $effect(() => {
	// 	if (markerAtPlayhead) selectedMarkerId = markerAtPlayhead.id;
	// });

	$effect(() => {
		localStorage.setItem("DefaultCategory", defaultCategory);
	});
	$effect(() => {
		localStorage.setItem("UpdateMarkerFocused", isUpdateMarkerFocused ? "true" : "false");
	});
	let creating = false;

	async function addMarkerAtPlayhead() {
		if (markerAtPlayhead) return markerAtPlayhead;
		if (creating) return;
		creating = true;
		try {
			let categories = await getCategories(projectId);

			let categoryId = categories[0]?.id;
			categoryId ??= (await createCategory({ name: "General", color: "#ffffff", projectId })).id;

			let defaultCategoryId = localStorage.getItem("DefaultCategory");

			if (defaultCategoryId) {
				if (categories.find((c) => c.id === defaultCategoryId)) {
					categoryId = defaultCategoryId;
				} else {
					localStorage.setItem("DefaultCategory", categoryId);
				}
			}
			return await createMarker({
				exportId: currentExportId,
				name: "",
				description: "",
				categoryId: categoryId,
				frame: currentFrame,
			});
		} finally {
			creating = false;
		}
	}

	function deleteKeypress(event: KeyboardEvent) {
		if (!event.metaKey || (event.key !== "Backspace" && event.key !== "Delete")) return;
		if (!selectedMarker || !updateMarkerComponent) return;

		const target = event.target as HTMLElement | null;
		if (target?.closest("input, textarea, select, [contenteditable]")) return;

		event.preventDefault();
		void updateMarkerComponent.remove();
	}

	function mKeypress(event: KeyboardEvent) {
		if (event.key !== "m" && event.key !== "M") return;
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

		const target = event.target as HTMLElement | null;

		if (target?.closest("input, textarea, select, [contenteditable]")) return;

		event.preventDefault();
		void addAndSelectMarker();
	}

	async function addAndSelectMarker() {
		const marker = await addMarkerAtPlayhead();
		if (!marker) return;
		selectedMarkerId = marker.id;
		if (localStorage.getItem("UpdateMarkerFocused") === "true") {
			// Wait for the markers list and UpdateMarker to render with the new marker
			await tick();
			setTimeout(() => updateMarkerComponent?.focusTitleInputField(), 50);
		}
	}
	export function setSelectedMarkerId(id: string | null) {
		selectedMarkerId = id;
	}
</script>

<div class="mb-4 flex max-w-full items-center justify-between px-2">
	<h1 class="shrink-0 text-2xl font-bold">Marker</h1>

	<div class="dropdown dropdown-left">
		<div tabindex="0" role="button" class="btn m-1 btn-circle btn-ghost">
			<Ellipsis class="h-6 w-6" />
		</div>
		<ul tabindex="-1" class="menu dropdown-content z-1 w-52 rounded-box bg-base-100 p-2 shadow-sm">
			<li>
				<details>
					<summary>Filter for Category</summary>
					<ul>
						<li>
							<a
								class={markerFilter.categoryIds.length === 0 ? "menu-active" : ""}
								onclick={() => markerFilter.clear()}>All</a
							>
						</li>
						{#each categories as category (category.id)}
							<li>
								<label class="flex cursor-pointer items-center gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-xs"
										checked={markerFilter.isActive(category.id)}
										onchange={() => markerFilter.toggle(category.id)}
									/>
									<CategoryBadge {category} class="badge-xs" />
								</label>
							</li>
						{/each}
					</ul>
				</details>
			</li>
			{#if markersComponents.length > 0}
				<li onclick={() => toggleCollapseAllMarkers()}>
					{#if markersComponents.some((marker) => marker?.isExpanded())}
						<a>Collapse All</a>
					{:else}
						<a>Expand All</a>
					{/if}
				</li>
			{/if}
		</ul>
	</div>
</div>

<Splitpanes theme="daisy-theme" horizontal class="h-full" style="height: 100%;">
	<Pane class="overflow-auto">
		<div class="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto *:shrink-0">
			{#each filteredMarkers as marker, index (marker.id)}
				<Marker
					{marker}
					active={marker.id === selectedMarkerId}
					bind:this={markersComponents[index]}
					onchoose={() => {
						selectedMarkerId = marker.id;
					}}
					onselect={onseek}
					{frameRate}
					{startFrame}
				/>
			{/each}
		</div>
	</Pane>
	{#if selectedMarker}
		<Pane minSize={29} maxSize={70} class="overflow-auto">
			<div class="h-full shrink-0 pb-10">
				{#key selectedMarker.id}
					<UpdateMarker
						bind:this={updateMarkerComponent}
						marker={selectedMarker}
						onclose={() => (selectedMarkerId = null)}
						{startFrame}
					/>
				{/key}
			</div>
		</Pane>
	{/if}
</Splitpanes>

<svelte:window on:keydown={mKeypress} on:keydown={deleteKeypress} />
