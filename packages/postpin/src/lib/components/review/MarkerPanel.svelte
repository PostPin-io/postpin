<script lang="ts">
	import { page } from "$app/state";
	import { tick } from "svelte";
	import { isTypingTarget } from "#lib/keyboard.ts";
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
		createMarkers,
		updateMarker,
		deleteMarkers,
		createCategory,
	} from "./MarkerPanel.remote.ts";
	import { copyMarkers, readMarkerClipboard } from "./markerClipboard.ts";
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
	let categorySearch = $state("");
	let filteredCategories = $derived(
		categories.filter((c) => c.name.toLowerCase().includes(categorySearch.trim().toLowerCase())),
	);
	let filteredMarkers = $derived(markerFilter.apply(markers));
	let selectedMarkerIds = $state<string[]>([]);
	// The editor is only shown while exactly one marker is selected
	let selectedMarkerId = $derived(selectedMarkerIds.length === 1 ? selectedMarkerIds[0] : null);
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

	async function resolveDefaultCategory() {
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
		return { categoryId, categoryIds: new Set(categories.map((c) => c.id)) };
	}

	async function addMarkerAtPlayhead() {
		if (markerAtPlayhead) return markerAtPlayhead;
		if (creating) return;
		creating = true;
		try {
			const { categoryId } = await resolveDefaultCategory();
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
		if (isTypingTarget(event)) return;

		if (selectedMarkerIds.length > 1) {
			event.preventDefault();
			void deleteSelectedMarkers();
		} else if (selectedMarker && updateMarkerComponent) {
			event.preventDefault();
			void updateMarkerComponent.remove();
		}
	}

	async function deleteSelectedMarkers() {
		const ids = markers
			.filter((marker) => selectedMarkerIds.includes(marker.id))
			.map((marker) => marker.id);
		if (ids.length === 0) return;
		await deleteMarkers({ exportId: currentExportId, ids });
		selectedMarkerIds = [];
	}

	function selectAllKeypress(event: KeyboardEvent) {
		if (!event.metaKey || event.altKey || event.shiftKey) return;
		if (event.key !== "a" && event.key !== "A") return;
		if (isTypingTarget(event) || filteredMarkers.length === 0) return;

		event.preventDefault();
		selectedMarkerIds = filteredMarkers.map((marker) => marker.id);
	}

	function escapeKeypress(event: KeyboardEvent) {
		if (event.key !== "Escape" || selectedMarkerIds.length === 0) return;
		if (isTypingTarget(event)) return;
		selectedMarkerIds = [];
	}

	function copyKeypress(event: KeyboardEvent) {
		if (!event.metaKey || event.altKey || event.shiftKey) return;
		if (event.key !== "c" && event.key !== "C") return;
		if (selectedMarkerIds.length === 0 || isTypingTarget(event)) return;
		// Keep the native copy when the user selected text
		if (!window.getSelection()?.isCollapsed) return;

		const selected = markers.filter((marker) => selectedMarkerIds.includes(marker.id));
		if (selected.length === 0) return;
		event.preventDefault();
		copyMarkers(selected);
	}

	let pasting = false;

	async function pasteMarkers() {
		const clipboard = readMarkerClipboard();
		if (clipboard.length === 0 || pasting) return;
		pasting = true;
		try {
			const { categoryId: fallbackCategoryId, categoryIds } = await resolveDefaultCategory();
			await createMarkers({
				exportId: currentExportId,
				markers: clipboard.map((item) => ({
					name: item.name,
					description: item.description,
					// The copied category may belong to another project
					categoryId: categoryIds.has(item.categoryId) ? item.categoryId : fallbackCategoryId,
					frame: Math.max(0, currentFrame + item.offset),
				})),
			});
		} finally {
			pasting = false;
		}
	}

	function pasteKeypress(event: KeyboardEvent) {
		if (!event.metaKey || event.altKey || event.shiftKey) return;
		if (event.key !== "v" && event.key !== "V") return;
		if (isTypingTarget(event)) return;
		if (readMarkerClipboard().length === 0) return;

		event.preventDefault();
		void pasteMarkers();
	}

	function mKeypress(event: KeyboardEvent) {
		if (event.key !== "m" && event.key !== "M") return;
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

		if (isTypingTarget(event)) return;

		event.preventDefault();
		void addAndSelectMarker();
	}

	async function addAndSelectMarker() {
		const marker = await addMarkerAtPlayhead();
		if (!marker) return;
		selectedMarkerIds = [marker.id];
		if (localStorage.getItem("UpdateMarkerFocused") === "true") {
			// Wait for the markers list and UpdateMarker to render with the new marker
			await tick();
			setTimeout(() => updateMarkerComponent?.focusTitleInputField(), 50);
		}
	}
	export function setSelectedMarkerId(id: string | null) {
		selectedMarkerIds = id ? [id] : [];
	}

	let anchorMarkerId: string | null = null;

	function selectRange(id: string) {
		const ids = filteredMarkers.map((marker) => marker.id);
		const from = anchorMarkerId ? ids.indexOf(anchorMarkerId) : -1;
		const to = ids.indexOf(id);
		if (from === -1 || to === -1) {
			selectedMarkerIds = [id];
			anchorMarkerId = id;
			return;
		}
		selectedMarkerIds = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
	}

	async function repositionMarker(marker: (typeof markers)[number], frame: number) {
		if (!Number.isInteger(frame) || frame < 0 || frame === marker.frame) return;
		await updateMarker({
			id: marker.id,
			exportId: marker.exportId,
			name: marker.name ?? "",
			description: marker.description ?? "",
			categoryId: marker.categoryId,
			frame,
		});
	}

	function toggleMarkerSelection(id: string) {
		anchorMarkerId = id;
		selectedMarkerIds = selectedMarkerIds.includes(id)
			? selectedMarkerIds.filter((selectedId) => selectedId !== id)
			: [...selectedMarkerIds, id];
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
						<li class="p-0 menu-title">
							<input
								type="search"
								class="input w-full input-xs"
								placeholder="Search categories"
								aria-label="Search categories"
								bind:value={categorySearch}
							/>
						</li>
						<li>
							<a
								class={markerFilter.categoryIds.length === 0 ? "menu-active" : ""}
								onclick={() => markerFilter.clear()}>All</a
							>
						</li>
						{#each filteredCategories as category (category.id)}
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
					active={selectedMarkerIds.includes(marker.id)}
					bind:this={markersComponents[index]}
					onchoose={() => {
						selectedMarkerIds = [marker.id];
						anchorMarkerId = marker.id;
					}}
					onrange={() => selectRange(marker.id)}
					ontoggle={() => toggleMarkerSelection(marker.id)}
					onselect={onseek}
					onreposition={(frame) => repositionMarker(marker, frame)}
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
						onclose={() => (selectedMarkerIds = [])}
						{startFrame}
					/>
				{/key}
			</div>
		</Pane>
	{/if}
</Splitpanes>

<svelte:window
	on:keydown={mKeypress}
	on:keydown={deleteKeypress}
	on:keydown={escapeKeypress}
	on:keydown={copyKeypress}
	on:keydown={pasteKeypress}
	on:keydown={selectAllKeypress}
/>
