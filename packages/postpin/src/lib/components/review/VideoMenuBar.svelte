<script lang="ts">
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	import Maximize from "@lucide/svelte/icons/maximize";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import VolumeX from "@lucide/svelte/icons/volume-x";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import Film from "@lucide/svelte/icons/film";
	import Timecode from "./Timecode.svelte";
	import { nextPlaybackRate, seekToMarker } from "./VideoPlayer";
	import {
		frameAtSeconds,
		secondsAtFrame,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";

	let {
		markers,
		timing,
		currentTime = $bindable(0),
		paused = $bindable(true),
		playbackRate = $bindable(1),
		quality = $bindable<number | "auto">("auto"),
		viewMode = $bindable<"shot-grid" | "timeline">("timeline"),
		qualities = [],
		muted = false,
		playerAvailable = false,
		onToggleMute,
		onFullscreen,
	}: {
		markers: { frame: number }[];
		timing: FrameTiming;
		currentTime?: number;
		paused?: boolean;
		playbackRate?: number;
		quality?: number | "auto";
		viewMode?: "shot-grid" | "timeline";
		qualities?: number[];
		muted?: boolean;
		/** Whether a video element is mounted; mute, quality and fullscreen need one */
		playerAvailable?: boolean;
		onToggleMute?: () => void;
		onFullscreen?: () => void;
	} = $props();

	// Absolute timeline frame, like marker frames
	const frame = $derived(frameAtSeconds(currentTime, timing));

	function seekToAdjacentMarker(direction: -1 | 1) {
		const markerFrame = seekToMarker(direction, { markers, playHeadPosition: frame });
		if (markerFrame !== undefined) currentTime = secondsAtFrame(markerFrame, timing);
	}

	function toggleViewMode() {
		viewMode = viewMode === "timeline" ? "shot-grid" : "timeline";
		if (viewMode === "shot-grid") paused = true;
	}

	// Pausing on purpose resets the speed; temporary pauses such as scrubbing keep it
	function togglePlayback() {
		if (viewMode === "shot-grid") {
			viewMode = "timeline";
			paused = false;
			return;
		}
		paused = !paused;
		if (paused) playbackRate = 1;
	}
</script>

<div class="grid w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 border-t-1 p-1">
	<div class="flex items-center gap-2 justify-self-start">
		<Timecode
			bind:frame={() => frame, (f) => (currentTime = secondsAtFrame(f, timing))}
			frameRate={timing.frameRate}
			startFrame={timing.startFrameIndex}
			editable={true}
		/>
		<span class="font-mono">|</span>
		<button
			class="font-mono"
			title="Change playback speed"
			onclick={() => (playbackRate = nextPlaybackRate(playbackRate))}
		>
			{playbackRate}×
		</button>
	</div>
	<div class="flex items-center justify-center">
		<button
			class="btn btn-square btn-ghost btn-xs"
			title="Jump to previous Marker on the left"
			onclick={() => seekToAdjacentMarker(-1)}
		>
			<ArrowLeft size={16} />
		</button>
		{#if playerAvailable}
			<button class="btn btn-square btn-ghost btn-xs" onclick={togglePlayback}>
				{#if paused}
					<Play size={16} />
				{:else}
					<Pause size={16} />
				{/if}
			</button>
		{:else}
			<button
				class="btn btn-square btn-ghost btn-xs"
				onclick={() => {
					viewMode = "timeline";
					togglePlayback();
				}}
			>
				{#if paused}
					<Play size={16} />
				{:else}
					<Pause size={16} />
				{/if}
			</button>
		{/if}
		<button
			class="btn btn-square btn-ghost btn-xs"
			title="Jump to next Marker on the right"
			onclick={() => seekToAdjacentMarker(1)}
		>
			<ArrowRight size={16} />
		</button>
	</div>
	<div class="flex items-center gap-1 justify-self-end">
		{#if playerAvailable}
			{#if qualities.length > 0}
				<select class="select w-24 select-xs" bind:value={quality}>
					<option value="auto">Auto</option>
					{#each qualities as height (height)}
						<option value={height}>{height}p</option>
					{/each}
				</select>
			{/if}
			<button class="btn btn-square btn-ghost btn-xs" onclick={() => onToggleMute?.()}>
				{#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}
			</button>
			<button class="btn btn-square btn-ghost btn-xs" onclick={() => onFullscreen?.()}>
				<Maximize size={16} />
			</button>
		{/if}
		<button
			class="btn btn-square btn-ghost btn-xs"
			title={viewMode === "timeline" ? "Show Shot Grid" : "Show Video"}
			onclick={toggleViewMode}
		>
			{#if viewMode === "timeline"}<LayoutGrid size={16} />{:else}<Film size={16} />{/if}
		</button>
	</div>
</div>
