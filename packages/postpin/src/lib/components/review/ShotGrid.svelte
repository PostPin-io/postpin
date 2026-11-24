<script lang="ts">
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { getShots, getTopClipShots, type GridShot } from "@postpin-io/shared/logic/shots";
	import { formatTimecode } from "@postpin-io/shared/logic/timecode";
	import { isWebUpload } from "@postpin-io/shared/logic/web-upload";
	import { shotGridMode } from "./shot-grid-mode.svelte.ts";

	interface Props {
		snapshot: TimelineSnapshot;
		/** One per shot, by shot index; null or undefined while it is being made or loaded */
		thumbnailUrls: (string | null)[] | undefined;
		currentFrame: number;
		onSeek(frame: number): void;
	}

	let { snapshot, thumbnailUrls, currentFrame, onSeek }: Props = $props();

	// Cuts detected in a web upload are one track without anything on top: only the cuts mode.
	// Timeline data imported with it can have tracks on top of each other, so the choice is back.
	const detectedCuts = $derived(isWebUpload(snapshot) && !snapshot.metadata.cutsFrom);
	const mode = $derived(detectedCuts ? "cuts" : shotGridMode.mode);

	// the thumbnails are rendered for the shots at every cut; the other mode shows some of them
	const shots: GridShot[] = $derived(
		mode === "top"
			? getTopClipShots(snapshot)
			: getShots(snapshot).map((s) => ({ ...s, thumbnailIndex: s.index })),
	);
	// the query 404s until the job is done, so only ask once the polled export says it is

	let cols = $state(5);
	// tiles at least 100px wide, so the timecode fits: counted from the grid's own width, the
	// window's is wider than the panel
	let gridWidth = $state(0);
	const maxCols = $derived(Math.max(1, Math.floor(gridWidth / 100)));
	const columns = $derived(Math.max(1, maxCols - Math.min(cols, maxCols) + 1));
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="flex items-center justify-end gap-2 border-b border-base-300 bg-base-100 p-2">
		{#if !detectedCuts}
			<div class="join mr-auto" role="group" aria-label="Shots">
				<button
					type="button"
					class="btn join-item btn-xs {shotGridMode.mode === 'cuts' ? 'btn-active' : ''}"
					aria-pressed={shotGridMode.mode === "cuts"}
					title="A shot at every cut on any video track"
					onclick={() => shotGridMode.set("cuts")}>Every cut</button
				>
				<button
					type="button"
					class="btn join-item btn-xs {shotGridMode.mode === 'top' ? 'btn-active' : ''}"
					aria-pressed={shotGridMode.mode === "top"}
					title="A shot per clip on the topmost video track that has one"
					onclick={() => shotGridMode.set("top")}>Top clip</button
				>
			</div>
		{/if}
		<input type="range" bind:value={cols} min="1" max={maxCols} class="range w-32 range-primary" />
	</div>

	<div class="min-h-0 flex-1 overflow-auto p-2" bind:clientWidth={gridWidth}>
		{#if shots.length > 0}
			<div class="grid gap-2" style="grid-template-columns: repeat({columns}, minmax(0, 1fr))">
				{#each shots as shot (shot.index)}
					{@const isCurrentShot =
						currentFrame >= shot.startFrameIndex &&
						currentFrame < shot.startFrameIndex + shot.durationFrameCount}
					{@const url = thumbnailUrls?.[shot.thumbnailIndex]}

					<button
						type="button"
						class="flex min-w-0 cursor-pointer flex-col gap-1 rounded p-1 text-left hover:bg-base-300 {isCurrentShot
							? 'ring-2 ring-primary'
							: ''}"
						title={shot.name}
						onclick={() => onSeek(shot.startFrameIndex)}
					>
						{#if url}
							<img
								src={url}
								alt={shot.name}
								loading="lazy"
								class="aspect-video w-full rounded bg-black object-contain"
							/>
						{:else}
							<div class="aspect-video w-full animate-pulse rounded bg-base-300"></div>
						{/if}
						<span class="truncate text-xs">{shot.name}</span>
						<span class="truncate font-mono text-xs text-base-content/60">
							{formatTimecode(shot.startFrameIndex, snapshot.frameRate)}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-base-content/60">No shots available.</p>
		{/if}
	</div>
</div>
