<script lang="ts">
	import { tick } from "svelte";
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import Timecode from "./Timecode.svelte";
	import { formatTimecode } from "./timecode";

	interface Props {
		snapshot: TimelineSnapshot;
		videoPositionSeconds: number;
		paused: boolean;
		playbackRate: number;
	}

	let {
		snapshot,
		videoPositionSeconds = $bindable(0),
		paused = $bindable(true),
		playbackRate = $bindable(1),
	}: Props = $props();

	const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4];

	// Most zoomed in: this many pixels per frame
	const MAX_PIXELS_PER_FRAME = 20;
	// Ruler labels stay at least this far apart
	const MIN_TICK_SPACING = 100;
	// Tick intervals in frames (below one second) and in seconds
	const TICK_STEPS_FRAMES = [1, 2, 5, 10];
	const TICK_STEPS_SECONDS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];

	// 1 = full timeline visible
	let zoom = $state(1);
	let viewportWidth = $state(0);
	let scrollLeft = $state(0);

	let pixelsPerFrame = $derived(
		snapshot.durationFrameCount > 0 ? (viewportWidth / snapshot.durationFrameCount) * zoom : 0,
	);
	let maxZoom = $derived(
		viewportWidth > 0
			? Math.max((MAX_PIXELS_PER_FRAME * snapshot.durationFrameCount) / viewportWidth, 1)
			: 1,
	);

	let tracks = $derived([
		...snapshot.tracks.filter((track) => track.type === "video").reverse(),
		...snapshot.tracks.filter((track) => track.type === "audio"),
	]);

	let headers = $state<HTMLDivElement>();
	let lanes = $state<HTMLDivElement>();
	let content = $state<HTMLDivElement>();
	let lanesOffsetHeight = $state(0);
	let lanesClientHeight = $state(0);

	const fps = $derived(snapshot.frameRate.fpsNumerator / snapshot.frameRate.fpsDenominator);

	// The frame on screen is the one that started before the time, hence floor
	const secondsToFrame = (seconds: number) => Math.floor(seconds * fps + 1e-6);
	// Middle of the frame, so the browser doesn't land on the previous one when seeking
	const frameToSeconds = (frame: number) => (frame + 0.5) / fps;

	const clampFrame = (frame: number) =>
		Math.min(Math.max(frame, 0), snapshot.durationFrameCount - 1);

	let playHeadPosition = $derived(secondsToFrame(videoPositionSeconds));

	function seek(frame: number) {
		videoPositionSeconds = frameToSeconds(clampFrame(frame));
	}

	// Clip starts and ends on all tracks, relative to the timeline start
	let cuts = $derived(
		[
			...new Set([
				0,
				snapshot.durationFrameCount - 1,
				...snapshot.tracks.flatMap((track) =>
					track.clips.flatMap((clip) => {
						const start = clip.startFrameIndex - snapshot.startFrameIndex;
						// ensure that end is within the timeline
						return [
							start,
							Math.min(start + clip.durationFrameCount, snapshot.durationFrameCount - 1),
						];
					}),
				),
			]),
		].sort((a, b) => a - b),
	);

	function seekToCut(direction: -1 | 1) {
		const cut =
			direction < 0
				? cuts.findLast((frame) => frame < playHeadPosition)
				: cuts.find((frame) => frame > playHeadPosition);
		if (cut !== undefined) seek(cut);
	}

	function changePlaybackRate(direction: -1 | 1) {
		const index = PLAYBACK_RATES.findIndex((rate) => rate >= playbackRate);
		const current = index === -1 ? PLAYBACK_RATES.length - 1 : index;
		playbackRate =
			PLAYBACK_RATES[Math.min(Math.max(current + direction, 0), PLAYBACK_RATES.length - 1)];
	}

	let tickFrames = $derived.by(() => {
		const minFrames = MIN_TICK_SPACING / pixelsPerFrame;
		const steps = [...TICK_STEPS_FRAMES, ...TICK_STEPS_SECONDS.map((s) => Math.round(s * fps))];
		return steps.find((step) => step >= minFrames) ?? steps[steps.length - 1];
	});

	// Only the ticks in view, a long timeline zoomed in has thousands
	let ticks = $derived.by(() => {
		if (pixelsPerFrame <= 0) return [];
		const first = Math.floor(scrollLeft / pixelsPerFrame / tickFrames);
		const last = Math.min(
			Math.ceil((scrollLeft + viewportWidth) / pixelsPerFrame / tickFrames),
			Math.floor((snapshot.durationFrameCount - 1) / tickFrames),
		);
		return Array.from(
			{ length: Math.max(last - first + 1, 0) },
			(_, i) => (first + i) * tickFrames,
		);
	});

	let dragging = $state(false);
	let wasPlaying = false;

	let lastClientX = 0;
	function frameAtClientX(clientX: number) {
		// The rect moves with scrolling, so scrollLeft is already included
		const x = clientX - content!.getBoundingClientRect().left;
		return Math.floor(x / pixelsPerFrame);
	}

	function startScrub(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragging = true;
		wasPlaying = !paused;
		paused = true;
		lastClientX = event.clientX;
		seek(frameAtClientX(lastClientX));
		startAutoScroll();
	}

	function scrub(event: PointerEvent) {
		if (!dragging) return;
		lastClientX = event.clientX;
		seek(frameAtClientX(lastClientX));
		startAutoScroll();
	}

	function endScrub() {
		if (!dragging) return;
		cancelAnimationFrame(autoScrollId);
		autoScrollId = 0;
		dragging = false;
		if (wasPlaying) paused = false;
	}

	// Page flip when the playhead leaves the view
	$effect(() => {
		const x = playHeadPosition * pixelsPerFrame;
		if (!lanes || dragging) return;
		if (x < lanes.scrollLeft || x > lanes.scrollLeft + lanes.clientWidth - 20) {
			lanes.scrollLeft = x - 20;
		}
	});

	// Keeps the anchor frame at the same place on screen
	async function setZoom(next: number, anchorFrame = playHeadPosition) {
		const offset = anchorFrame * pixelsPerFrame - (lanes?.scrollLeft ?? 0);
		zoom = Math.min(Math.max(next, 1), maxZoom);
		await tick();
		if (lanes) lanes.scrollLeft = anchorFrame * pixelsPerFrame - offset;
	}

	function onWheel(event: WheelEvent) {
		// A trackpad pinch arrives as a wheel event with ctrlKey
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		setZoom(zoom * Math.exp(-event.deltaY * 0.01), frameAtClientX(event.clientX));
	}

	const AUTO_SCROLL_EDGE = 40;
	// Per frame at 60 Hz, scaled by the real time between frames on faster displays
	const AUTO_SCROLL_MAX_PIXELS_PER_FRAME = 30;
	const MAX_SCROLL_SPEED_FACTOR = 3;
	const FRAME_MS_60HZ = 1000 / 60;
	let autoScrollId = 0;
	let autoScrollLastTime = 0;

	function startAutoScroll() {
		if (autoScrollId) return;
		autoScrollLastTime = 0;
		autoScrollId = requestAnimationFrame(autoScroll);
	}

	function autoScroll(now: number) {
		autoScrollId = 0;
		if (!dragging || !lanes) return;

		// first frame is missing a previous one, and a hidden tab pauses the loop for long
		const elapsed = autoScrollLastTime ? Math.min(now - autoScrollLastTime, 100) : FRAME_MS_60HZ;
		autoScrollLastTime = now;

		const left = lanes.getBoundingClientRect().left;
		const right = left + lanes.clientWidth;
		const depth =
			lastClientX < left + AUTO_SCROLL_EDGE
				? lastClientX - (left + AUTO_SCROLL_EDGE) // negative: to the left
				: lastClientX > right - AUTO_SCROLL_EDGE
					? lastClientX - (right - AUTO_SCROLL_EDGE)
					: 0;
		if (depth === 0) return;

		// Speed grows with distance, but max at MAX_SCROLL_SPEED_FACTORx. At least 1px, as Chrome may round smaller steps
		// away and the loop would stop although there is more to scroll.
		const speed =
			Math.sign(depth) *
			Math.max(
				Math.min(Math.abs(depth) / (AUTO_SCROLL_EDGE * MAX_SCROLL_SPEED_FACTOR), 1) *
					AUTO_SCROLL_MAX_PIXELS_PER_FRAME *
					(elapsed / FRAME_MS_60HZ),
				1,
			);
		const before = lanes.scrollLeft;
		lanes.scrollLeft += speed;
		if (lanes.scrollLeft === before) return;

		seek(frameAtClientX(lastClientX));
		// re-run this function on the next animation frame
		autoScrollId = requestAnimationFrame(autoScroll);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement) return;
		const step = event.shiftKey ? Math.round(fps) : 1;
		switch (event.key) {
			case "ArrowLeft":
				seek(playHeadPosition - step);
				break;
			case "ArrowRight":
				seek(playHeadPosition + step);
				break;
			case "ArrowUp":
				seekToCut(-1);
				break;
			case "ArrowDown":
				seekToCut(1);
				break;
			case "+":
				changePlaybackRate(1);
				break;
			case "-":
				changePlaybackRate(-1);
				break;
			case "Home":
				seek(0);
				break;
			case "End":
				seek(snapshot.durationFrameCount - 1);
				break;
			case " ":
				paused = !paused;
				break;
			default:
				return;
		}
		event.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex h-full flex-col outline-none" tabindex="0" onkeydown={onKeyDown}>
	<div class="flex items-center justify-between gap-2 border-b border-gray-300 p-2">
		<div class="flex items-center gap-2">
			<Timecode
				frame={playHeadPosition}
				frameRate={snapshot.frameRate}
				startFrame={snapshot.startFrameIndex}
			/>
			<span class="font-mono">|</span>
			<span class="font-mono"> {playbackRate}×</span>
		</div>
		<span class="text-xs text-gray-500">
			Space play/pause · ←/→ frame · ↑/↓ previous/next cut · +/- speed
		</span>
		<div>
			Zoom:
			<input
				type="range"
				min="0"
				max={Math.log(maxZoom)}
				step="0.01"
				value={Math.log(zoom)}
				oninput={(event) => setZoom(Math.exp(Number(event.currentTarget.value)))}
				class="range w-32 range-primary"
			/>
		</div>
	</div>

	<div class="flex min-h-0 flex-1">
		<div bind:this={headers} class="w-32 shrink-0 overflow-hidden border-r border-gray-300">
			<div class="sticky top-0 z-20 h-12 border-b border-gray-300 bg-base-100"></div>
			{#each tracks as track (track.id)}
				<div
					class="flex h-12 items-center truncate border-b border-gray-300 px-2 text-sm"
					title={track.name}
				>
					{track.name}
				</div>
			{/each}
			<!-- Room for the lanes' horizontal scrollbar, so both scroll to the same bottom -->
			<div style="height: {lanesOffsetHeight - lanesClientHeight}px"></div>
		</div>

		<div
			bind:this={lanes}
			class="min-w-0 flex-1 overflow-auto"
			bind:clientWidth={viewportWidth}
			bind:offsetHeight={lanesOffsetHeight}
			bind:clientHeight={lanesClientHeight}
			onscroll={(event) => {
				scrollLeft = event.currentTarget.scrollLeft;
				if (headers) headers.scrollTop = event.currentTarget.scrollTop;
			}}
			onwheel={onWheel}
		>
			<div
				bind:this={content}
				class="relative"
				style="width: {snapshot.durationFrameCount * pixelsPerFrame}px"
			>
				<div
					class="sticky top-0 z-20 h-12 cursor-ew-resize overflow-hidden border-b border-gray-300 bg-base-100 select-none"
					tabindex="-1"
					onpointerdown={startScrub}
					onpointermove={scrub}
					onpointerup={endScrub}
					onpointercancel={endScrub}
				>
					{#each ticks as tickFrame (tickFrame)}
						<div
							class="absolute top-0 h-full border-l border-gray-400 pt-1 pl-1 font-mono text-xs text-gray-500"
							style="left: {tickFrame * pixelsPerFrame}px"
						>
							{formatTimecode(snapshot.startFrameIndex + tickFrame, snapshot.frameRate)}
						</div>
					{/each}

					<div
						class="pointer-events-none absolute bottom-0 -ml-1.5 border-x-[6px] border-t-8 border-x-transparent border-t-red-500"
						style="left: {playHeadPosition * pixelsPerFrame}px"
					></div>
				</div>

				{#each tracks as track (track.id)}
					<div class="relative h-12 border-b border-gray-300">
						{#each track.clips as clip (clip.id)}
							<button
								type="button"
								class="absolute inset-y-1 cursor-pointer overflow-hidden rounded-sm border px-1 text-left text-xs whitespace-nowrap text-white {track.type ===
								'video'
									? 'border-blue-700 bg-blue-500'
									: 'border-green-800 bg-green-600'}"
								style="left: {(clip.startFrameIndex - snapshot.startFrameIndex) *
									pixelsPerFrame}px; width: {clip.durationFrameCount * pixelsPerFrame}px"
								title={clip.name}
								onclick={() => seek(clip.startFrameIndex - snapshot.startFrameIndex)}
							>
								{clip.name}
							</button>
						{/each}
					</div>
				{/each}

				<div
					class="pointer-events-none absolute inset-y-0 left-0 z-30 w-px bg-red-500"
					style="transform: translateX({playHeadPosition * pixelsPerFrame}px)"
				></div>
			</div>
		</div>
	</div>
</div>
