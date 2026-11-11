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
	import Diamond from "@lucide/svelte/icons/diamond";
	import DiamondPlus from "@lucide/svelte/icons/diamond-plus";
	import Settings2 from "@lucide/svelte/icons/settings-2";
	import { contrastColor } from "../categories/category-color.ts";
	import {
		nextPlaybackRate,
		nextTimelineMode,
		seekToMarker,
		type TimelineMode,
	} from "./video-player";
	import {
		frameAtSeconds,
		secondsAtFrame,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";
	import type { Snippet } from "svelte";

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
		onCreateMarker,
		markerColor,
		timelineControls = true,
		status,
		mobile = false,
		mobileLandscape = false,
	}: {
		/** Drawn on the scrub bar when there is no timeline to show them */
		markers: { id: string; frame: number; category: { color: string } }[];
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
		/** Shows the add-marker button */
		onCreateMarker?: () => void;
		/** Color of the add-marker button: the category new markers get */
		markerColor?: string;
		/** Timeline mode and shot-grid buttons; off when there is no timeline (share links) */
		timelineControls?: boolean;
		/** Shown first in the right-hand group, e.g. the processing jobs */
		status?: Snippet;
		mobile?: boolean;
		mobileLandscape?: boolean;
	} = $props();

	// Phones: finger-sized buttons (40px instead of 24px). Speed, previous/next marker and mute
	// are left out there, so everything fits in one row
	const btnSize = $derived(mobile ? "btn-md" : "btn-xs");
	const iconSize = $derived(mobile ? 22 : 16);

	// Absolute timeline frame, like marker frames
	const frame = $derived(frameAtSeconds(currentTime, timing));

	function seekToAdjacentMarker(direction: -1 | 1) {
		const markerFrame = seekToMarker(direction, { markers, playHeadPosition: frame });
		if (markerFrame !== undefined) currentTime = secondsAtFrame(markerFrame, timing);
	}

	// Position of a frame on the scrub bar, 0 to 1 (the middle of the frame)
	const barPosition = (f: number) =>
		Math.min(1, Math.max(0, (f - timing.startFrameIndex + 0.5) / durationFrames));
	const progress = $derived(barPosition(frame));

	// Without the timeline (phones, share links without it, fullscreen) the markers go on the scrub bar
	const showMarkers = $derived(!timelineControls || fullscreen);
	// A tap this close to a marker lands on it: a diamond is hard to hit exactly with a finger
	const SNAP_PX = 8;

	let scrubbing = false;
	let resumeAfterScrub = false;

	function scrubTo(event: PointerEvent & { currentTarget: HTMLElement }) {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const fraction = Math.min(1, Math.max(0, x / rect.width));
		const offset = Math.min(durationFrames - 1, Math.floor(fraction * durationFrames));
		let target = timing.startFrameIndex + offset;

		if (showMarkers) {
			let nearest = SNAP_PX;
			for (const marker of markers) {
				const distance = Math.abs(barPosition(marker.frame) * rect.width - x);
				if (distance <= nearest) {
					nearest = distance;
					target = marker.frame;
				}
			}
		}
		currentTime = secondsAtFrame(target, timing);
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
		class="w-full cursor-pointer touch-none {mobile ? 'py-3' : 'py-1'}"
		onpointerdown={startScrub}
		onpointermove={moveScrub}
		onpointerup={endScrub}
		onpointercancel={endScrub}
	>
		<div class="relative h-1 w-full bg-base-300">
			<div class="h-full bg-primary" style:width="{progress * 100}%"></div>
			{#if showMarkers}
				{#each markers as marker (marker.id)}
					<span
						class="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
						style:left="{barPosition(marker.frame) * 100}%"
						aria-hidden="true"
					>
						<Diamond
							class="size-2.5"
							fill={marker.category.color}
							stroke="rgb(0 0 0 / 0.4)"
							strokeWidth={1.5}
						/>
					</span>
				{/each}
			{/if}
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
				{mobile}
				{mobileLandscape}
			/>
			{#if !mobile}
				<span class="font-mono">|</span>
				<button
					class="font-mono"
					title="Change playback speed"
					onclick={() => (playbackRate = nextPlaybackRate(playbackRate))}
				>
					{playbackRate}×
				</button>
			{/if}
		</div>
		<!-- The add-marker button hangs off the left edge so play stays centered under the video -->
		<div class="relative flex items-center justify-center">
			{#if onCreateMarker}
				<button
					class="btn absolute right-full btn-square btn-ghost {btnSize} {markerColor
						? 'hover:border-(--marker-color) hover:bg-(--marker-color) hover:text-(--marker-contrast)'
						: ''}"
					style:--marker-color={markerColor}
					style:--marker-contrast={markerColor ? contrastColor(markerColor) : undefined}
					title="Add marker at playhead (M)"
					aria-label="Add marker at playhead"
					onclick={() => onCreateMarker()}
				>
					<DiamondPlus size={iconSize} />
				</button>
			{/if}
			{#if !mobile}
				<button
					class="btn btn-square btn-ghost {btnSize}"
					title="Jump to previous Marker on the left"
					onclick={() => seekToAdjacentMarker(-1)}
				>
					<ArrowLeft size={iconSize} />
				</button>
			{/if}
			<button class="btn btn-square btn-ghost {btnSize}" onclick={togglePlayback}>
				{#if paused}
					<Play size={iconSize} />
				{:else}
					<Pause size={iconSize} />
				{/if}
			</button>
			{#if !mobile}
				<button
					class="btn btn-square btn-ghost {btnSize}"
					title="Jump to next Marker on the right"
					onclick={() => seekToAdjacentMarker(1)}
				>
					<ArrowRight size={iconSize} />
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-1 justify-self-end">
			{#if status && !fullscreen}{@render status()}{/if}
			{#if !fullscreen && timelineControls}
				<button
					class="btn btn-square btn-ghost {btnSize}"
					title={timelineMode === "full"
						? "Compact Timeline"
						: timelineMode === "compact"
							? "Show Only Scrub Area"
							: "Expand Timeline"}
					onclick={() => (timelineMode = nextTimelineMode(timelineMode))}
				>
					{#if timelineMode === "full"}<ChevronsDownUp
							size={iconSize}
						/>{:else if timelineMode === "compact"}<FoldVertical
							size={iconSize}
						/>{:else}<ChevronsUpDown size={iconSize} />{/if}
				</button>
			{/if}
			{#if playerAvailable}
				{#if qualities.length > 0}
					{#if mobile}
						<label class="btn relative btn-square btn-ghost {btnSize}" title="Video quality">
							<Settings2 size={iconSize} />
							<select
								aria-label="Video quality"
								class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
								bind:value={quality}
							>
								<option value="auto">Auto</option>
								{#each qualities as height (height)}
									<option value={height}>{height}p</option>
								{/each}
							</select>
						</label>
					{:else}
						<select class="select w-24 select-xs" bind:value={quality}>
							<option value="auto">Auto</option>
							{#each qualities as height (height)}
								<option value={height}>{height}p</option>
							{/each}
						</select>
					{/if}
				{/if}
				{#if !mobile}
					<button class="btn btn-square btn-ghost {btnSize}" onclick={() => onToggleMute?.()}>
						{#if muted}<VolumeX size={iconSize} />{:else}<Volume2 size={iconSize} />{/if}
					</button>
				{/if}
				<button
					class="btn btn-square btn-ghost {btnSize}"
					title={fullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
					onclick={() => onFullscreen?.()}
				>
					{#if fullscreen}<Minimize size={iconSize} />{:else}<Maximize size={iconSize} />{/if}
				</button>
			{/if}

			{#if !fullscreen && timelineControls}
				<button
					class="btn btn-square btn-ghost {btnSize}"
					title={viewMode === "timeline" ? "Show Shot Grid" : "Show Video"}
					onclick={toggleViewMode}
				>
					{#if viewMode === "timeline"}<LayoutGrid size={iconSize} />{:else}<Film
							size={iconSize}
						/>{/if}
				</button>
			{/if}
		</div>
	</div>
</div>
