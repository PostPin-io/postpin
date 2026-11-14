<script lang="ts">
	import Maximize from "@lucide/svelte/icons/maximize";
	import Minimize from "@lucide/svelte/icons/minimize";
	import Pause from "@lucide/svelte/icons/pause";
	import Play from "@lucide/svelte/icons/play";
	import {
		formatTimecode,
		frameAtSeconds,
		secondsAtFrame,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";

	interface Props {
		timing: FrameTiming;
		durationFrames: number;
		currentTime: number;
		paused: boolean;
		playbackRate: number;
		fullscreen: boolean;
		onFullscreen: () => void;
	}
	let {
		timing,
		durationFrames,
		currentTime = $bindable(),
		paused = $bindable(),
		playbackRate = $bindable(),
		fullscreen,
		onFullscreen,
	}: Props = $props();

	// The screening window's own controls, for emergencies: the screening is run from the export
	// view. Deliberately bare, and without markers: the audience sees this screen.

	const frame = $derived(frameAtSeconds(currentTime, timing));
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

	function endScrub() {
		if (!scrubbing) return;
		scrubbing = false;
		if (resumeAfterScrub) paused = false;
	}

	// Pausing on purpose resets the speed, like in the export view
	function togglePlayback() {
		paused = !paused;
		if (paused) playbackRate = 1;
	}
</script>

<div class="bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3 text-white">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="cursor-pointer touch-none py-2"
		onpointerdown={startScrub}
		onpointermove={(event) => scrubbing && scrubTo(event)}
		onpointerup={endScrub}
		onpointercancel={endScrub}
	>
		<div class="h-1.5 w-full rounded-full bg-white/30">
			<div class="h-full rounded-full bg-white" style:width="{progress * 100}%"></div>
		</div>
	</div>
	<div class="flex items-center gap-3">
		<button
			class="btn btn-circle btn-ghost text-white btn-sm hover:bg-white/20"
			title={paused ? "Play (Space)" : "Pause (Space)"}
			aria-label={paused ? "Play" : "Pause"}
			onclick={togglePlayback}
		>
			{#if paused}<Play size={18} class="fill-current" />{:else}<Pause
					size={18}
					class="fill-current"
				/>{/if}
		</button>
		<span class="font-mono text-sm">{formatTimecode(frame, timing.frameRate)}</span>
		<span class="flex-1"></span>
		<button
			class="btn btn-ghost text-white btn-sm hover:bg-white/20"
			title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
			onclick={onFullscreen}
		>
			{#if fullscreen}<Minimize size={16} /> Exit fullscreen{:else}<Maximize size={16} /> Fullscreen{/if}
		</button>
	</div>
</div>
