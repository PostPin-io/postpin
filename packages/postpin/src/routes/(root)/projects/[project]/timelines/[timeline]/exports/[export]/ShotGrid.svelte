<script lang="ts">
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { getShots } from "@postpin-io/shared/logic/shots";
	import { formatTimecode } from "@postpin-io/shared/logic/timecode";
	import { getShotThumbnails } from "./export.remote";

	interface Props {
		snapshot: TimelineSnapshot;
		mediaId: string;
		thumbnailsReady: boolean;
		currentFrame: number;
		onSeek(frame: number): void;
	}

	let { snapshot, mediaId, thumbnailsReady, currentFrame, onSeek }: Props = $props();

	const shots = $derived(getShots(snapshot));
	// the query 404s until the job is done, so only ask once the polled export says it is
	const shotThumbnails = $derived(thumbnailsReady ? getShotThumbnails({ mediaId }) : undefined);

	let cols = $state(5);
	const maxCols = $derived(Math.floor(window.innerWidth / 100));
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="flex items-center justify-end gap-2 border-b border-gray-300 p-2">
		<input type="range" bind:value={cols} min="1" max={maxCols} class="range w-32 range-primary" />
	</div>

	<div class="min-h-0 flex-1 overflow-auto p-2">
		{#if shots.length > 0}
			<div
				class="grid gap-2"
				style="grid-template-columns: repeat({maxCols - cols + 1}, minmax(0, 1fr))"
			>
				{#each shots as shot (shot.index)}
					{@const isCurrentShot =
						currentFrame >= shot.startFrameIndex &&
						currentFrame < shot.startFrameIndex + shot.durationFrameCount}
					{@const url = shotThumbnails?.current?.urls[shot.index]}
					<button
						type="button"
						class="flex cursor-pointer flex-col gap-1 rounded p-1 text-left hover:bg-base-200 {isCurrentShot
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
							<div class="aspect-video w-full animate-pulse rounded bg-gray-200"></div>
						{/if}
						<span class="truncate text-xs">{shot.name}</span>
						<span class="font-mono text-xs text-gray-500">
							{formatTimecode(shot.startFrameIndex, snapshot.frameRate)}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-500">No shots available.</p>
		{/if}
	</div>
</div>
