<script lang="ts">
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	import Maximize from "@lucide/svelte/icons/maximize";
	import Minimize from "@lucide/svelte/icons/minimize";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import VolumeX from "@lucide/svelte/icons/volume-x";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import Film from "@lucide/svelte/icons/film";
	import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
	import Timecode from "./Timecode.svelte";
	import FoldVertical from "@lucide/svelte/icons/fold-vertical";
	import {
		nextPlaybackRate,
		nextTimelineMode,
		seekToMarker,
		type TimelineMode,
	} from "./VideoPlayer";
	import {
		frameAtSeconds,
		secondsAtFrame,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";

	let {
		markers,
		timing,
		durationFrames,
		currentTime = $bindable(0),
		paused = $bindable(true),
		playbackRate = $bindable(1),
		quality = $bindable<number | "auto">("auto"),
		viewMode = $bindable<"shot-grid" | "timeline">("timeline"),
		timelineMode = $bindable<TimelineMode>("full"),
		qualities = [],
		muted = false,
		playerAvailable = false,
		fullscreen = false,
		onToggleMute,
		onFullscreen,
		timelineControls = true,
	}: {
		markers: { frame: number }[];
		timing: FrameTiming;
		/** Length of the timeline; sizes the scrub bar */
		durationFrames: number;
		currentTime?: number;
		paused?: boolean;
		playbackRate?: number;
		quality?: number | "auto";
		viewMode?: "shot-grid" | "timeline";
		timelineMode?: TimelineMode;
		qualities?: number[];
		muted?: boolean;
		/** Whether a video element is mounted; mute, quality and fullscreen need one */
		playerAvailable?: boolean;
		/** Fullscreen hides the buttons that would leave the video */
		fullscreen?: boolean;
		onToggleMute?: () => void;
		onFullscreen?: () => void;
		/** Timeline mode and shot-grid buttons; off when there is no timeline (share links) */
		timelineControls?: boolean;
	} = $props();

	// Absolute timeline frame, like marker frames
	const frame = $derived(frameAtSeconds(currentTime, timing));

	function seekToAdjacentMarker(direction: -1 | 1) {
		const markerFrame = seekToMarker(direction, { markers, playHeadPosition: frame });
		if (markerFrame !== undefined) currentTime = secondsAtFrame(markerFrame, timing);
	}

	const progress = $derived(
		Math.min(1, Math.max(0, (frame - timing.startFrameIndex + 0.5) / durationFrames)),
	);

	let scrubbing = false;
	let resumeAfterScrub = false;

	function scrubTo(event: PointerEvent & { currentTarget: HTMLElement }) {
		const rect = event.currentTarget.getBoundingClientRect();
		const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		const offset = Math.min(durationFrames - 1, Math.floor(fraction * durationFrames));
		currentTime = secondsAtFrame(timing.startFrameIndex + offset, timing);
	}

	function startScrub(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (event.button !== 0 || durationFrames <= 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		scrubbing = true;
		resumeAfterScrub = !paused;
		paused = true;
		scrubTo(event);
	}

	function moveScrub(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (scrubbing) scrubTo(event);
	}

	function endScrub() {
		if (!scrubbing) return;
		scrubbing = false;
		if (resumeAfterScrub) paused = false;
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

<div class="w-full shrink-0 border-t-1">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-full cursor-pointer touch-none py-1"
		onpointerdown={startScrub}
		onpointermove={moveScrub}
		onpointerup={endScrub}
		onpointercancel={endScrub}
	>
		<div class="h-1 w-full bg-base-300">
			<div class="h-full bg-primary" style:width="{progress * 100}%"></div>
		</div>
	</div>
	<div class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1 p-1">
		<div class="flex items-center gap-2 justify-self-start">
			<Timecode
				bind:frame={() => frame, (f) => (currentTime = secondsAtFrame(f, timing))}
				frameRate={timing.frameRate}
				startFrame={timing.startFrameIndex}
				frameCount={durationFrames}
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
			{#if !fullscreen && timelineControls}
				<button
					class="btn btn-square btn-ghost btn-xs"
					title={timelineMode === "full"
						? "Compact Timeline"
						: timelineMode === "compact"
							? "Show Only Scrub Area"
							: "Expand Timeline"}
					onclick={() => (timelineMode = nextTimelineMode(timelineMode))}
				>
					{#if timelineMode === "full"}<ChevronsDownUp
							size={16}
						/>{:else if timelineMode === "compact"}<FoldVertical size={16} />{:else}<ChevronsUpDown
							size={16}
						/>{/if}
				</button>
			{/if}
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
				<button
					class="btn btn-square btn-ghost btn-xs"
					title={fullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
					onclick={() => onFullscreen?.()}
				>
					{#if fullscreen}<Minimize size={16} />{:else}<Maximize size={16} />{/if}
				</button>
			{/if}

			{#if !fullscreen && timelineControls}
				<button
					class="btn btn-square btn-ghost btn-xs"
					title={viewMode === "timeline" ? "Show Shot Grid" : "Show Video"}
					onclick={toggleViewMode}
				>
					{#if viewMode === "timeline"}<LayoutGrid size={16} />{:else}<Film size={16} />{/if}
				</button>
			{/if}
		</div>
	</div>
</div>
