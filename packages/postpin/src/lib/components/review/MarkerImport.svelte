<script lang="ts">
	// Plugin exports: their timeline is the editing software's, but markers from a marker list (EDL,
	// FCPXML) can be imported, e.g. from a colleague who works without the plugin
	// the same icon as the timeline data menu of web uploads
	import FileText from "@lucide/svelte/icons/file-text";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import TimelineDataImport, { type ImportResult } from "./TimelineDataImport.svelte";
	import { tick } from "svelte";
	import { iconDrop, importedMarkersText } from "#lib/upload/cut-list-file.ts";

	interface Props {
		exportId: string;
		frameRate: FrameRate;
		/** Markers imported from timeline data, by format */
		importedMarkers: Record<"edl" | "fcpxml", number> | null;
		/** Called after an import, so the counts above follow */
		onchanged?: () => void | Promise<void>;
	}
	let { exportId, frameRate, importedMarkers, onchanged }: Props = $props();
	const markersText = $derived(importedMarkersText(importedMarkers));
	/** After an import the window only says so; it starts over once it is opened again */
	let imported = $state<ImportResult | null>(null);

	// A file dropped on the icon opens the window and is imported right away
	let details: HTMLDetailsElement | null = $state(null);
	let importer: ReturnType<typeof TimelineDataImport> | null = $state(null);
	let iconDragging = $state(false);
	const onIcon = iconDrop({
		enabled: () => true,
		ondragging: (d) => (iconDragging = d),
		ondropped: async (read) => {
			imported = null;
			if (details) details.open = true;
			await tick();
			await importer?.importFrom(read);
		},
	});
</script>

<!-- Not on phones: timeline data comes from an editing software on a computer -->
<details
	bind:this={details}
	class="dropdown dropdown-end dropdown-top max-sm:hidden"
	ontoggle={(e) => {
		if (!e.currentTarget.open) imported = null;
	}}
>
	<summary
		class="btn gap-1 btn-ghost btn-xs {iconDragging
			? 'btn-active outline-2 outline-primary outline-dashed'
			: ''}"
		{...onIcon}
		title="Import markers from an EDL or FCPXML"
		aria-label="Import markers"
	>
		<FileText size={14} />
	</summary>
	<div class="dropdown-content z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-sm shadow-lg">
		{#if imported}
			<div class="flex flex-col items-center gap-2 py-3 text-center" role="status">
				<CircleCheck size={32} class="text-success" />
				<p class="font-semibold">{imported.title}</p>
				<p class="text-xs text-base-content/60">{imported.detail}</p>
				<button type="button" class="btn mt-1 btn-ghost btn-xs" onclick={() => (imported = null)}>
					Back
				</button>
			</div>
		{:else}
			{#if markersText}
				<p class="font-semibold">{markersText.title}</p>
				<p class="mt-1 mb-3 text-xs text-base-content/60">{markersText.count}</p>
			{:else}
				<p class="mb-3 font-semibold">Import markers</p>
			{/if}
			<TimelineDataImport
				bind:this={importer}
				{exportId}
				{frameRate}
				modes={["markers"]}
				{onchanged}
				onimported={(result) => (imported = result)}
			/>
		{/if}
	</div>
</details>
