<script lang="ts">
	import { page } from "$app/state";
	import { tick } from "svelte";
	import { SvelteSet } from "svelte/reactivity";
	import RouteOff from "@lucide/svelte/icons/route-off";
	import { hasCommandKey, isTypingTarget } from "#lib/keyboard.ts";
	import Marker from "./Marker.svelte";
	import UpdateMarker from "./UpdateMarker.svelte";
	import ResponseMarker from "./ResponseMarker.svelte";
	import MobileMarkerModal from "./MobileMarkerModal.svelte";
	import CategoryBadge from "../../categories/CategoryBadge.svelte";
	import { markerFilter } from "./marker-filter.svelte.ts";
	import { defaultCategory } from "./default-category.svelte.ts";
	import {
		filterMarkers,
		selectRange as selectRangeOf,
		sortMarkers as sortMarkersBy,
		type SortField,
	} from "./marker-list.ts";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import { Pane, Splitpanes } from "svelte-splitpanes";
	import { useShare } from "../share-context.ts";
	import { markersKey } from "./marker-scope.ts";
	import DiamondPlus from "@lucide/svelte/icons/diamond-plus";
	import {
		getMarkers,
		getCategories,
		createMarker,
		pasteMarkers as pasteMarkersRemote,
		updateMarker,
		deleteMarkers,
		createCategory,
	} from "./markers.remote.ts";
	import {
		readMarkerClipboard,
		writeMarkerClipboard,
		clearMarkerClipboard,
	} from "./marker-clipboard.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import { isInTimeline, lastFrameOf, type FrameRange } from "@postpin-io/shared/logic/ranges";
	import { rangeFromMarks, type InOut } from "../timeline-view.ts";

	interface Props {
		exportId: string;
		currentFrame: number;
		/** In and out point from the timeline: the next marker spans them */
		inOut?: InOut;
		/** Called after a marker was created from inOut, to clear it */
		onrangeused?: () => void;
		onseek: (frame: number) => void;
		startFrame: number;
		frameRate: FrameRate;
		/** Timeline length in frames */
		frameCount: number;
		/** Phones: markers are edited in a fullscreen modal instead of the pane below the list */
		mobile?: boolean;
		/** The review shows the selected markers' pointers on the picture */
		selectedMarkerIds?: string[];
	}
	let {
		exportId,
		currentFrame,
		inOut = { in: null, out: null },
		onrangeused,
		onseek,
		frameRate,
		startFrame,
		frameCount,
		mobile = false,
		selectedMarkerIds = $bindable([]),
	}: Props = $props();
	let updateMarkerComponent: UpdateMarker | null = null;

	// On a share link: guests see only their own markers, no categories, no copy/paste
	const getShare = useShare();
	const share = $derived(getShare());
	const shareToken = $derived(share?.token);

	const currentExportId = $derived(exportId);
	// Team only: the share page has no project in its URL, and guests don't pick categories
	const projectId = $derived(page.params.project ?? "");

	let markers = $derived(await getMarkers(markersKey(currentExportId, shareToken)));

	// Where M puts the next marker: the in/out range, or the playhead
	let nextRange = $derived(rangeFromMarks(inOut, currentFrame));
	// Pressing M again selects the marker instead of adding the same one twice
	let existingAtNext = $derived(
		markers.find((m) => m.frame === nextRange.frame && m.duration === nextRange.duration),
	);
	// Markers under the playhead (ranges it is in, points it sits on), highlighted in the list
	let playingIds = $derived(
		new Set(
			markers
				.filter((m) => m.frame <= currentFrame && currentFrame <= lastFrameOf(m))
				.map((m) => m.id),
		),
	);
	const timeline = $derived({ startFrameIndex: startFrame, durationFrameCount: frameCount });

	// Kept here, not in each card: "expand all" needs it and it survives sorting and filtering
	const expandedIds = new SvelteSet<string>();

	let categories = $derived(share ? [] : await getCategories(projectId));
	let categorySearch = $state("");
	let filteredCategories = $derived(
		categories.filter((c) => c.name.toLowerCase().includes(categorySearch.trim().toLowerCase())),
	);
	const sortFields: { value: SortField; label: string }[] = [
		{ value: "updatedAt", label: "Updated at" },
		{ value: "createdAt", label: "Created at" },
		{ value: "user", label: "User" },
		{ value: "timecode", label: "Timecode" },
	];

	let sortDirection: "asc" | "desc" = $state("asc");
	let sortField: SortField = $state("timecode");

	const sortMarkers = <T extends (typeof markers)[number]>(list: T[]) =>
		sortMarkersBy(list, sortField, sortDirection);
	const deletable = $derived(
		markers.filter((m) => selectedMarkerIds.includes(m.id)).every((m) => m.canDelete),
	);

	let search = $state("");

	// Markers currently rendered in the list, in display order: category filter AND search
	let visibleMarkers = $derived(
		sortMarkers(filterMarkers(markers, markerFilter.categoryIds, search)),
	);

	let hasActiveFilters = $derived(markerFilter.categoryIds.length > 0 || search.trim() !== "");

	function clearAllFilters() {
		markerFilter.clear();
		search = "";
	}

	// The editor is only shown while exactly one marker is selected
	let selectedMarkerId = $derived(selectedMarkerIds.length === 1 ? selectedMarkerIds[0] : null);
	let selectedMarker = $derived(markers.find((marker) => marker.id === selectedMarkerId));

	// Phones: the marker open in the modal
	let editingMarkerId = $state<string | null>(null);
	let editingMarker = $derived(markers.find((marker) => marker.id === editingMarkerId));

	// The neighbors the modal shows as cards while swiping; none at the ends of the list
	let editingIndex = $derived(visibleMarkers.findIndex((marker) => marker.id === editingMarkerId));
	let previousMarker = $derived(editingIndex > 0 ? visibleMarkers[editingIndex - 1] : undefined);
	let nextMarker = $derived(editingIndex !== -1 ? visibleMarkers[editingIndex + 1] : undefined);

	function navigateEditingMarker(direction: -1 | 1) {
		const target = direction === 1 ? nextMarker : previousMarker;
		if (target) editingMarkerId = target.id;
	}

	let isUpdateMarkerFocused = $state(false);

	// The response window replaces the editor for the marker being responded to
	let respondingMarkerId = $state<string | null>(null);
	let isResponding = $derived(
		respondingMarkerId !== null && respondingMarkerId === selectedMarkerId,
	);
	let responseMarkerComponent: ResponseMarker | null = null;

	$effect(() => {
		if (respondingMarkerId !== null && respondingMarkerId !== selectedMarkerId) {
			respondingMarkerId = null;
		}
	});

	async function respondTo(id: string) {
		selectedMarkerIds = [id];
		anchorMarkerId = id;
		respondingMarkerId = id;
		await tick();
		setTimeout(() => responseMarkerComponent?.focusInput(), 50);
	}

	let anyVisibleExpanded = $derived(visibleMarkers.some((marker) => expandedIds.has(marker.id)));

	function toggleCollapseAllMarkers() {
		if (anyVisibleExpanded) expandedIds.clear();
		else visibleMarkers.forEach((marker) => expandedIds.add(marker.id));
	}

	// Bring the selected marker into view, e.g. a new one added with M further down the list
	let listElement: HTMLElement | null = $state(null);
	$effect(() => {
		const id = selectedMarkerId;
		if (!id || !listElement) return;
		// After the editor pane opened and the list got its new height
		const handle = requestAnimationFrame(() => {
			listElement
				?.querySelector(`[data-marker-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ block: "nearest" });
		});
		return () => cancelAnimationFrame(handle);
	});

	$effect(() => {
		localStorage.setItem("UpdateMarkerFocused", isUpdateMarkerFocused ? "true" : "false");
	});
	let creating = false;

	async function resolveDefaultCategory() {
		const categories = await getCategories(projectId);

		let categoryId = categories.find((c) => c.id === defaultCategory.id)?.id ?? categories[0]?.id;
		categoryId ??= (await createCategory({ name: "General", color: "#ffffff", projectId })).id;

		if (defaultCategory.id && defaultCategory.id !== categoryId) defaultCategory.set(categoryId);
		return { categoryId, categoryIds: new Set(categories.map((c) => c.id)) };
	}

	async function addMarkerAtPlayhead() {
		if (existingAtNext) return existingAtNext;
		if (creating) return;
		creating = true;
		const range = nextRange;
		try {
			// Guests have no categories: the server puts their markers in the guest category
			const categoryId = share ? undefined : (await resolveDefaultCategory()).categoryId;
			const marker = await createMarker({
				exportId: currentExportId,
				name: "",
				description: "",
				categoryId,
				...range,
				shareToken,
			});
			// The in point was used up, like in the NLEs
			if (inOut.in !== null) onrangeused?.();
			return marker;
		} finally {
			creating = false;
		}
	}

	function deleteKeypress(event: KeyboardEvent) {
		if (!hasCommandKey(event) || (event.key !== "Backspace" && event.key !== "Delete")) return;
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
		if (!deletable) return;
		const ids = markers
			.filter((marker) => selectedMarkerIds.includes(marker.id))
			.map((marker) => marker.id);
		if (ids.length === 0) return;
		await deleteMarkers({ exportId: currentExportId, ids, shareToken });
		selectedMarkerIds = [];
	}

	function selectAllKeypress(event: KeyboardEvent) {
		if (!hasCommandKey(event) || event.altKey || event.shiftKey) return;
		if (event.key !== "a" && event.key !== "A") return;
		if (isTypingTarget(event) || visibleMarkers.length === 0) return;

		event.preventDefault();
		selectedMarkerIds = visibleMarkers.map((marker) => marker.id);
	}

	function escapeKeypress(event: KeyboardEvent) {
		if (event.key !== "Escape" || isTypingTarget(event)) return;
		// Cancels a pending cut first, the markers stay where they are
		if (cutIds.size > 0) {
			clearMarkerClipboard();
			reloadClipboard();
			return;
		}
		selectedMarkerIds = [];
	}

	function copyOrCutKeypress(event: KeyboardEvent) {
		// Copy and paste work across exports: team only
		if (share) return;

		if (!hasCommandKey(event) || event.altKey || event.shiftKey) return;
		const key = event.key.toLowerCase();
		if (key !== "c" && key !== "x") return;
		if (selectedMarkerIds.length === 0 || isTypingTarget(event)) return;
		// Keep the native copy when the user selected text. A multi-selection of markers always wins,
		// because shift-clicking a range also extends the browser's text selection.
		if (selectedMarkerIds.length <= 1 && !window.getSelection()?.isCollapsed) return;

		const selected = markers.filter((marker) => selectedMarkerIds.includes(marker.id));
		if (selected.length === 0) return;
		event.preventDefault();
		if (key === "x" && !deletable) return;

		writeMarkerClipboard({
			sourceExportId: currentExportId,
			markerIds: selected.map((m) => m.id),
			mode: key === "x" ? "cut" : "copy",
		});
		reloadClipboard();
	}

	// Markers cut with ⌘X on this export, shown faded until pasted
	let clipboard = $state(readMarkerClipboard());
	let cutIds = $derived(
		new Set(
			clipboard?.mode === "cut" && clipboard.sourceExportId === currentExportId
				? clipboard.markerIds
				: [],
		),
	);

	// Also when another tab cuts or pastes
	function reloadClipboard() {
		clipboard = readMarkerClipboard();
	}

	let pasting = false;

	async function pasteMarkers() {
		const pasted = readMarkerClipboard();
		if (!pasted || pasting) return;
		pasting = true;
		try {
			const { categoryId: fallbackCategoryId } = await resolveDefaultCategory();
			const { skipped } = await pasteMarkersRemote({
				...pasted,
				targetExportId: currentExportId,
				anchorFrame: Math.max(0, currentFrame),
				fallbackCategoryId,
			});

			if (pasted.mode === "cut") {
				clearMarkerClipboard();
				reloadClipboard();
			}
			if (skipped > 0) alert(`${skipped} marker(s) no longer exist and were skipped.`);
		} catch (e) {
			alert(`Could not paste markers: ${(e as Error).message}`);
		} finally {
			pasting = false;
		}
	}

	function pasteKeypress(event: KeyboardEvent) {
		// Copy and paste work across exports: team only
		if (share) return;

		if (!hasCommandKey(event) || event.altKey || event.shiftKey) return;
		if (event.key !== "v" && event.key !== "V") return;
		if (isTypingTarget(event)) return;
		if (!readMarkerClipboard()) return;

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
		// Phones: a new marker opens straight in the modal, ready for its title
		if (mobile) {
			editingMarkerId = marker.id;
			return;
		}
		if (localStorage.getItem("UpdateMarkerFocused") === "true") {
			// Wait for the markers list and UpdateMarker to render with the new marker
			await tick();
			setTimeout(() => updateMarkerComponent?.focusTitleInputField(), 50);
		}
	}
	export function createMarkerAtPlayhead() {
		return addAndSelectMarker();
	}
	export function setSelectedMarkerId(id: string | null) {
		selectedMarkerIds = id ? [id] : [];
	}

	let anchorMarkerId: string | null = null;

	function selectRange(id: string) {
		const range = selectRangeOf(
			visibleMarkers.map((marker) => marker.id),
			anchorMarkerId,
			id,
		);
		selectedMarkerIds = range.selected;
		anchorMarkerId = range.anchor;
	}

	// A range that would run past the end stops there, instead of the server refusing it
	async function repositionMarker(marker: (typeof markers)[number], frame: number) {
		if (!Number.isInteger(frame) || frame < 0) return;
		const lastStart = startFrame + Math.max(frameCount, 1) - Math.max(marker.duration, 1);
		await saveRange(marker, { frame: Math.min(frame, lastStart), duration: marker.duration });
	}

	async function resizeMarker(marker: (typeof markers)[number], duration: number) {
		if (!Number.isInteger(duration) || duration < 0) return;
		await saveRange(marker, { frame: marker.frame, duration });
	}

	async function saveRange(marker: (typeof markers)[number], range: FrameRange) {
		if (range.frame === marker.frame && range.duration === marker.duration) return;
		if (!isInTimeline(range, timeline)) return;
		await updateMarker({
			id: marker.id,
			name: marker.name ?? "",
			description: marker.description ?? "",
			categoryId: marker.categoryId,
			...range,
			shareToken,
		});
	}

	function toggleMarkerSelection(id: string) {
		anchorMarkerId = id;
		selectedMarkerIds = selectedMarkerIds.includes(id)
			? selectedMarkerIds.filter((selectedId) => selectedId !== id)
			: [...selectedMarkerIds, id];
	}
</script>

<div class="flex h-full min-h-0 flex-1 flex-col">
	<div class="mb-4 flex max-w-full shrink-0 items-center justify-between px-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<h2 class="text-lg font-bold">Markers</h2>
			<input
				type="search"
				class="input min-w-0 flex-1 input-xs"
				placeholder="Search"
				aria-label="Search markers"
				bind:value={search}
			/>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title={sortDirection == "asc" ? "Sorted ascending" : "Sorted descending"}
				aria-label="Toggle sort direction"
				onclick={() => {
					sortDirection = sortDirection == "asc" ? "desc" : "asc";
				}}
			>
				{#if sortDirection == "asc"}
					<ChevronUp size={18} />
				{:else}
					<ChevronDown size={18} />
				{/if}
			</button>
			{#if hasActiveFilters}
				<button
					type="button"
					class="btn btn-square btn-ghost btn-sm"
					title="Clear all filters"
					aria-label="Clear all filters"
					onclick={clearAllFilters}
				>
					<RouteOff size={18} />
				</button>
			{/if}
		</div>
		<div
			class="dropdown dropdown-left"
			onfocusout={(event) => {
				// Collapse all submenus once focus leaves the dropdown
				const next = event.relatedTarget as Node | null;
				if (next && event.currentTarget.contains(next)) return;
				event.currentTarget.querySelectorAll("details").forEach((d) => (d.open = false));
			}}
		>
			<div tabindex="0" role="button" class="btn m-1 btn-circle btn-ghost">
				<Ellipsis class="h-6 w-6" />
			</div>
			<ul
				tabindex="-1"
				class="menu dropdown-content z-1 w-52 rounded-box bg-base-100 p-2 shadow-sm"
			>
				{#if !share}
					<li>
						<details>
							<summary>Filter for Category</summary>
							<ul>
								<li class="p-0 menu-title">
									<input
										type="search"
										class="input w-full input-xs"
										placeholder="Search categories"
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
				{/if}
				<li>
					<details>
						<summary>Sort by</summary>
						<ul>
							{#each sortFields as field (field.value)}
								<li>
									<a
										class={sortField === field.value ? "menu-active" : ""}
										onclick={() => (sortField = field.value)}>{field.label}</a
									>
								</li>
							{/each}
						</ul>
					</details>
				</li>
				{#if visibleMarkers.length > 0 && !mobile}
					<li onclick={() => toggleCollapseAllMarkers()}>
						{#if anyVisibleExpanded}
							<a>Collapse All</a>
						{:else}
							<a>Expand All</a>
						{/if}
					</li>
				{/if}
			</ul>
		</div>
	</div>

	<Splitpanes theme="daisy-theme" horizontal class="min-h-0 flex-1">
		<Pane class="overflow-auto">
			<!-- py-1: room for the selection ring of the first and last card -->
			<div
				bind:this={listElement}
				class="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1 *:shrink-0"
			>
				{#each visibleMarkers as marker (marker.id)}
					<Marker
						{marker}
						active={selectedMarkerIds.includes(marker.id)}
						cut={cutIds.has(marker.id)}
						playing={playingIds.has(marker.id)}
						expanded={expandedIds.has(marker.id)}
						onexpand={(expanded) => {
							if (expanded) expandedIds.add(marker.id);
							else expandedIds.delete(marker.id);
						}}
						onchoose={() => {
							selectedMarkerIds = [marker.id];
							anchorMarkerId = marker.id;
						}}
						onrange={() => selectRange(marker.id)}
						ontoggle={() => toggleMarkerSelection(marker.id)}
						onselect={onseek}
						onreposition={(frame) => repositionMarker(marker, frame)}
						onresize={(duration) => resizeMarker(marker, duration)}
						onrespond={() => respondTo(marker.id)}
						{mobile}
						onedit={() => (editingMarkerId = marker.id)}
						{frameRate}
						{startFrame}
						{frameCount}
					/>
				{/each}

				{#if markers.length === 0}
					<div class="flex flex-col items-start gap-2 p-4">
						<!-- Touch screens have no keyboard: only the button there -->
						<p class="text-base-content/70">
							No markers yet.
							<span class="pointer-coarse:hidden">
								Press <kbd class="kbd kbd-sm">M</kbd> or click
							</span>
							<span class="pointer-fine:hidden">Tap</span>
							<DiamondPlus class="inline size-3.5" /> under the video to add one.
						</p>
					</div>
				{:else if visibleMarkers.length === 0 && hasActiveFilters}
					<div class="flex flex-col items-start gap-2 p-4">
						<p class="text-base-content/70">No markers match the active filters.</p>
						<button type="button" class="btn btn-sm" onclick={clearAllFilters}>
							Clear all filters
						</button>
					</div>
				{/if}
			</div>
		</Pane>
		{#if selectedMarker && !mobile}
			<Pane minSize={29} maxSize={70} class="overflow-auto">
				<div class="h-full shrink-0 pb-10">
					{#key selectedMarker.id}
						{#if isResponding}
							<ResponseMarker
								bind:this={responseMarkerComponent}
								marker={selectedMarker}
								onclose={() => (respondingMarkerId = null)}
							/>
						{:else}
							<UpdateMarker
								bind:this={updateMarkerComponent}
								marker={selectedMarker}
								onclose={() => (selectedMarkerIds = [])}
								{startFrame}
								{frameRate}
								{frameCount}
							/>
						{/if}
					{/key}
				</div>
			</Pane>
		{/if}
	</Splitpanes>
</div>

{#if mobile}
	<MobileMarkerModal
		marker={editingMarker}
		previous={previousMarker}
		next={nextMarker}
		{currentFrame}
		{frameCount}
		{startFrame}
		{frameRate}
		onnavigate={navigateEditingMarker}
		onclose={() => (editingMarkerId = null)}
	/>
{/if}

<svelte:window
	on:storage={reloadClipboard}
	on:keydown={mKeypress}
	on:keydown={deleteKeypress}
	on:keydown={escapeKeypress}
	on:keydown={copyOrCutKeypress}
	on:keydown={pasteKeypress}
	on:keydown={selectAllKeypress}
/>
