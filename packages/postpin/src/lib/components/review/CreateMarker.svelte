<script lang="ts">
	import { createMarker } from "./MarkerPanel.remote";
	import { page } from "$app/state";

	import Marker from "./Marker.svelte";

	let { currentFrame }: Props = $props();

	interface Props {
		currentFrame: number;
	}

	let name = "";
	let description = "";

	let exportId = page.params.export ?? "";
	let categoryId = "";
</script>

<fieldset class="fieldset w-xs rounded-box border border-base-300 bg-base-200 p-4">
	<legend class="fieldset-legend">Create Marker</legend>
	<div class="join">
		<input type="text" class="input join-item" placeholder="Product name" bind:value={name} />
		<input type="text" class="input join-item" placeholder="Description" bind:value={description} />
		<input type="text" class="input join-item" placeholder="Category ID" bind:value={categoryId} />
		<button
			class="btn join-item"
			onclick={() => createMarker({ exportId, name, description, categoryId, frame: currentFrame })}
		>
			Save</button
		>
	</div>
</fieldset>
