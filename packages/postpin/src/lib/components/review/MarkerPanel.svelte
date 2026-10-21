<script lang="ts">
	import { page } from "$app/state";
	import Marker from "./Marker.svelte";
	import UpdateMarker from "./UpdateMarker.svelte";
	import { Pane, Splitpanes } from "svelte-splitpanes";

	import { getMarkers, getCategories, createMarker, createCategory } from "./MarkerPanel.remote.ts";

	interface Props {
		currentFrame: number;
		onseek: (frame: number) => void;
	}
	let { currentFrame, onseek }: Props = $props();
	let updateMarkerComponent: UpdateMarker | null = null;
	const currentExportId = $derived(page.params.export ?? "");
	const projectId = $derived(page.params.project ?? "");
	const defaultCategory = $derived(localStorage.getItem("DefaultCategory") ?? "");

	let markers = $derived(await getMarkers(currentExportId));
	let markerAtPlayhead = $derived(markers.find((marker) => marker.frame === currentFrame));

	let selectedMarkerId = $state<string | null>(null);
	let selectedMarker = $derived(markers.find((marker) => marker.id === selectedMarkerId));

	let isUpdateMarkerFocused = $state(false);

	$effect(() => {
		if (markerAtPlayhead) selectedMarkerId = markerAtPlayhead.id;
	});

	$effect(() => {
		localStorage.setItem("DefaultCategory", defaultCategory);
	});
	$effect(() => {
		localStorage.setItem("UpdateMarkerFocused", isUpdateMarkerFocused ? "true" : "false");
	});
	let creating = false;

	async function addMarkerAtPlayhead() {
		if (creating || markerAtPlayhead) return;
		creating = true;
		try {
			let categoryId = (await getCategories(projectId))[0]?.id;
			categoryId ??= (await createCategory({ name: "General", color: "#ffffff", projectId })).id;

			await createMarker({
				exportId: currentExportId,
				name: "",
				description: "",
				categoryId: localStorage.getItem("DefaultCategory") ?? categoryId,
				frame: currentFrame,
			});
		} finally {
			creating = false;
		}
	}

	function mKeypress(event: KeyboardEvent) {
		if (event.key !== "m" && event.key !== "M") return;
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

		const target = event.target as HTMLElement | null;

		if (target?.closest("input, textarea, select, [contenteditable]")) return;

		event.preventDefault();
		void addMarkerAtPlayhead();
		if (localStorage.getItem("UpdateMarkerFocused") === "true") {
			setTimeout(() => updateMarkerComponent?.focusTitleInputField(), 50);
		}
	}
</script>

<h1 style="margin-left: 10px;" class="shrink-0 text-2xl font-bold">Marker</h1>
<Splitpanes theme="daisy-theme" horizontal class="h-full" style="height: 100%;">
	<Pane class="overflow-auto">
		<div class="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto *:shrink-0">
			{#each markers as marker (marker.id)}
				<Marker {marker} active={marker.id === markerAtPlayhead?.id} onselect={onseek} />
			{:else}
				<p class="px-3 text-sm text-base-content/60">No markers yet.</p>
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
					/>
				{/key}
			</div>
		</Pane>
	{/if}
</Splitpanes>

<svelte:window on:keydown={mKeypress} />
