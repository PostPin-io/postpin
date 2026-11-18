<script lang="ts">
	import Check from "@lucide/svelte/icons/check";
	import Diamond from "@lucide/svelte/icons/diamond";
	import NotebookPen from "@lucide/svelte/icons/notebook-pen";
	import Pause from "@lucide/svelte/icons/pause";
	import Play from "@lucide/svelte/icons/play";
	import Projector from "@lucide/svelte/icons/projector";
	import { contrastColor } from "#lib/components/categories/category-color.ts";
	import {
		formatTimecode,
		frameAtSeconds,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";

	interface Props {
		timing: FrameTiming;
		durationFrames: number;
		/** Where the presenter is, moved on every frame by the view */
		currentTime: number;
		paused: boolean;
		rate: number;
		/** The guest's own markers, as ticks on the progress bar */
		markers: { id: string; frame: number; category: { color: string } }[];
		/** Shows the button that sets a marker and opens it, to write the note right away */
		onCreateMarker?: () => void;
		/** Shows the button that only sets a marker: fast, for a whole row of them */
		onQuickMarker?: () => Promise<unknown> | undefined;
		markerColor?: string;
		/** Phones: the space of a 16:9 video, above the marker panel */
		compact?: boolean;
	}
	let {
		timing,
		durationFrames,
		currentTime,
		paused,
		rate,
		markers,
		onCreateMarker,
		onQuickMarker,
		markerColor,
		compact = false,
	}: Props = $props();

	// A screening guest's place of the video: the picture is on the big screen in the room.
	// Read-only on purpose: the presenter moves the playhead, everybody's is the same.

	const frame = $derived(frameAtSeconds(currentTime, timing));
	const barPosition = (f: number) =>
		Math.min(1, Math.max(0, (f - timing.startFrameIndex + 0.5) / durationFrames));
	const progress = $derived(barPosition(frame));

	// The quick marker opens nothing, so a short confirmation on the button shows it worked
	let quick = $state<{ kind: "set"; timecode: string } | { kind: "failed" } | null>(null);
	let quickTimer: ReturnType<typeof setTimeout> | undefined;
	async function quickMarker() {
		const timecode = formatTimecode(frame, timing.frameRate);
		try {
			await onQuickMarker?.();
			quick = { kind: "set", timecode };
		} catch {
			quick = { kind: "failed" };
		}
		clearTimeout(quickTimer);
		quickTimer = setTimeout(() => (quick = null), 1500);
	}
	$effect(() => () => clearTimeout(quickTimer));

	// Phones: big targets side by side, for a thumb in a dark room without looking (56px, well
	// above the usual 44-48). touch-manipulation: quick taps in a row don't zoom the page.
	const buttonClass = $derived(
		compact ? "btn h-14 touch-manipulation text-base" : "btn touch-manipulation",
	);
	const iconSize = $derived(compact ? 22 : 18);
</script>

<div
	class="flex h-full flex-col items-center justify-center bg-neutral px-4 text-center text-neutral-content {compact
		? 'gap-2 py-3'
		: 'gap-4 py-6'}"
>
	<p class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
		<span class="status animate-pulse status-error" aria-hidden="true"></span>
		Screening running
	</p>

	<p
		class="font-mono font-semibold tabular-nums {compact ? 'text-3xl' : 'text-5xl'}"
		aria-label="Playhead"
	>
		{formatTimecode(frame, timing.frameRate)}
	</p>

	<p class="flex items-center gap-1.5 text-sm text-neutral-content/70" aria-live="polite">
		{#if paused}
			<Pause size={14} class="fill-current" /> Paused
		{:else}
			<Play size={14} class="fill-current" /> Playing{#if rate !== 1}&nbsp;· {rate}×{/if}
		{/if}
	</p>

	<div class="relative w-full max-w-xl py-1" aria-hidden="true">
		<div class="h-1.5 w-full rounded-full bg-neutral-content/20">
			<div class="h-full rounded-full bg-neutral-content" style:width="{progress * 100}%"></div>
		</div>
		{#each markers as marker (marker.id)}
			<span
				class="absolute top-1/2 size-2 -translate-1/2 rotate-45 border border-neutral"
				style:left="{barPosition(marker.frame) * 100}%"
				style:background-color={marker.category.color}
			></span>
		{/each}
	</div>

	{#if !compact}
		<p class="flex max-w-md items-center gap-2 text-sm text-neutral-content/70">
			<Projector size={16} class="shrink-0" />
			The video plays on the big screen. Your playhead follows it, so your markers land where the screen
			is.
		</p>
	{/if}

	{#if onQuickMarker || onCreateMarker}
		<div class={compact ? "grid w-full grid-cols-2 gap-3" : "flex flex-wrap justify-center gap-2"}>
			{#if onQuickMarker}
				<button
					class={buttonClass}
					style:background-color={markerColor}
					style:border-color={markerColor}
					style:color={markerColor ? contrastColor(markerColor) : undefined}
					title="Set a marker here, without opening it"
					onclick={quickMarker}
				>
					{#if quick?.kind === "set"}
						<Check size={iconSize} />
						{#if compact}
							<!-- the timecode doesn't fit beside it on half a phone's width -->
							<span class="flex flex-col items-start leading-tight">
								Set <span class="font-mono text-xs opacity-80">{quick.timecode}</span>
							</span>
						{:else}
							Set at {quick.timecode}
						{/if}
					{:else if quick?.kind === "failed"}
						{compact ? "Try again" : "Couldn't set it, try again"}
					{:else}
						<Diamond size={iconSize} /> Quick marker
					{/if}
				</button>
			{/if}
			{#if onCreateMarker}
				<button
					class={buttonClass}
					style:background-color={markerColor}
					style:border-color={markerColor}
					style:color={markerColor ? contrastColor(markerColor) : undefined}
					title="Set a marker here and write its note (M)"
					onclick={() => onCreateMarker()}
				>
					<NotebookPen size={iconSize} />
					{compact ? "With note" : "Marker with note"}
				</button>
			{/if}
		</div>
		<span class="sr-only" aria-live="polite">
			{quick?.kind === "set" ? `Marker set at ${quick.timecode}` : ""}
		</span>
	{/if}
</div>
