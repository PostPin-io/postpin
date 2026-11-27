<script lang="ts">
	import { tick } from "svelte";
	import Diamond from "@lucide/svelte/icons/diamond";
	import ZoomIn from "@lucide/svelte/icons/zoom-in";
	import RangeEdgeIcon from "#lib/components/review/RangeEdgeIcon.svelte";
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { onMount } from "svelte";
	import type { ThumbnailElement, ThumbnailImage } from "@videojs/html";
	import { seekToMarker, type TimelineMode } from "#lib/components/review/video-player.ts";
	import {
		adjacentCut,
		buildLanes,
		clipStyle,
		collapsedLaneCount,
		laneClass,
		stepPlaybackRate,
		dragRange,
		dragSignals,
		orderMarks,
		tickStep,
		timelineCuts,
		visibleTicks,
		type InOut,
		type RangeDragMode,
	} from "./timeline-view.ts";
	import { getMarkers, updateMarker } from "#lib/components/review/markers/markers.remote.ts";
	import { useMarkerHistory } from "#lib/components/review/markers/marker-history.svelte.ts";
	import {
		formatTimecode,
		frameAtSeconds,
		secondsAtFrame,
	} from "@postpin-io/shared/logic/timecode";
	import type { ReviewMarker } from "#lib/components/review/markers/types.ts";
	import { useShare } from "./share-context.ts";
	import { markersKey } from "./markers/marker-scope.ts";
	import { lastFrameOf, type FrameRange } from "@postpin-io/shared/logic/ranges";
	import GuideButton from "#lib/components/guides/GuideButton.svelte";
	import { commandKeyLabel } from "#lib/keyboard.ts";
	import { signalGuide } from "#lib/components/guides/guide-signals.svelte.ts";

	interface Props {
		snapshot: TimelineSnapshot;
		markers: ReviewMarker[];
		videoPositionSeconds: number;
		paused: boolean;
		playbackRate: number;
		seekThumbnails: ThumbnailImage[] | undefined;
		mode?: TimelineMode;
		/** In and out point for the next marker, set with I and O */
		inOut?: InOut;

		onCollapsedHeight: (height: number) => void;
		/** A marker on the timeline was clicked: the review selects it in the marker panel */
		onmarkerclick?: (markerId: string) => void;
		/** The one selected marker, if any: the marker-ranges tour points at it */
		selectedMarkerId?: string | null;
	}

	const getShare = useShare();
	const markerHistory = useMarkerHistory();
	const share = $derived(getShare());

	let {
		snapshot,
		videoPositionSeconds = $bindable(0),
		paused = $bindable(true),
		playbackRate = $bindable(1),
		markers,
		seekThumbnails,
		mode = "full",
		inOut = $bindable({ in: null, out: null }),
		onCollapsedHeight,
		onmarkerclick,
		selectedMarkerId = null,
	}: Props = $props();

	let hover = $state<{ time: number; x: number; y: number } | null>(null);
	let preview = $state<ThumbnailElement>();
	let thumbnailReady = $state(false);

	// Most zoomed in: this many pixels per frame
	const MAX_PIXELS_PER_FRAME = 20;
	// Ruler labels stay at least this far apart
	const MIN_TICK_SPACING = 100;

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

	const collapsed = $derived(mode !== "full");

	let tracks = $derived(buildLanes(snapshot.tracks, mode));
	const laneHeight = $derived(collapsed ? "h-7" : "h-12");

	let headers = $state<HTMLDivElement>();
	let lanes = $state<HTMLDivElement>();
	let content = $state<HTMLDivElement>();
	let lanesOffsetHeight = $state(0);
	let lanesClientHeight = $state(0);
	const COLLAPSED_BOTTOM_SPACE = 24;

	// Compact layout has one merged lane per track type, regardless of the current state.
	// Using tracks.length here would count every track while expanded and report a wrong height.
	const collapsedLanes = $derived(collapsedLaneCount(snapshot.tracks, mode));

	$effect(() => {
		// Ruler (h-8), 28px lanes, plus fixed room for the scrollbar. Not measured, as the
		// scrollbar appearing would resize the pane and loop.
		onCollapsedHeight(32 + collapsedLanes * 28 + COLLAPSED_BOTTOM_SPACE);
	});

	const fps = $derived(snapshot.frameRate.fpsNumerator / snapshot.frameRate.fpsDenominator);

	// Frames are absolute timeline frames throughout, only pixel positions count from the start
	const firstFrame = $derived(snapshot.startFrameIndex);
	const lastFrame = $derived(snapshot.startFrameIndex + snapshot.durationFrameCount - 1);
	const toX = (frame: number) => (frame - firstFrame) * pixelsPerFrame;

	const clampFrame = (frame: number) => Math.min(Math.max(frame, firstFrame), lastFrame);

	let playHeadPosition = $derived(frameAtSeconds(videoPositionSeconds, snapshot));

	function seek(frame: number) {
		videoPositionSeconds = secondsAtFrame(clampFrame(frame), snapshot);
	}

	// Clip starts and ends on all tracks
	let cuts = $derived(timelineCuts(snapshot.tracks, firstFrame, lastFrame));

	function seekToCut(direction: -1 | 1) {
		const cut = adjacentCut(cuts, playHeadPosition, direction);
		if (cut !== undefined) seek(cut);
	}

	function seekToAdjacentMarker(direction: -1 | 1) {
		const frame = seekToMarker(direction, { markers, playHeadPosition });
		if (frame !== undefined) seek(frame);
	}

	function changePlaybackRate(direction: -1 | 1) {
		playbackRate = stepPlaybackRate(playbackRate, direction);
	}

	let tickFrames = $derived(tickStep(pixelsPerFrame, fps, MIN_TICK_SPACING));

	// Only the ticks in view, a long timeline zoomed in has thousands
	let ticks = $derived(
		visibleTicks({
			scrollLeft,
			viewportWidth,
			pixelsPerFrame,
			tickFrames,
			durationFrameCount: snapshot.durationFrameCount,
			firstFrame,
		}),
	);

	let markerDrag = $state<{
		id: string;
		mode: RangeDragMode;
		origin: FrameRange;
		/** Frame under the pointer when the drag started: the marker moves by the difference */
		grabFrame: number;
		current: FrameRange;
	} | null>(null);

	// Alt turns a marker's head into a handle: a point marker pulls out a range, a range edge resizes
	let altHeld = $state(false);
	const trackAlt = (event: KeyboardEvent | PointerEvent) => (altHeld = event.altKey);

	const rangeOf = (m: ReviewMarker): FrameRange =>
		markerDrag?.id === m.id ? markerDrag.current : { frame: m.frame, duration: m.duration };

	// Markers with any part in view, a range may start left of it
	let visibleMarkers = $derived.by(() => {
		const first = firstFrame + Math.floor((scrollLeft - 8) / pixelsPerFrame);
		const last = firstFrame + Math.ceil((scrollLeft + viewportWidth) / pixelsPerFrame);
		return markers.filter((m) => {
			const range = rangeOf(m);
			return range.frame <= last && lastFrameOf(range) >= first;
		});
	});

	// Resize handles need room next to the diamond
	const HANDLE_MIN_WIDTH = 12;
	// A point marker's line, border-l-2 plus border-r: the diamond sits on its middle
	const LINE_WIDTH = 3;

	function startMarkerDrag(
		event: PointerEvent & { currentTarget: HTMLElement },
		marker: ReviewMarker,
		mode: RangeDragMode = "move",
		/** The range edge whose head was grabbed: with Alt it resizes instead of moving the range */
		edge?: "start" | "end",
	) {
		if (event.button !== 0) return;
		// Keep the ruler from starting a scrub, and the bar from moving when a handle is grabbed
		event.stopPropagation();
		// Grabbing a marker's head selects it, whether it then gets dragged or only clicked
		onmarkerclick?.(marker.id);
		if (!marker.canUpdate) {
			seek(marker.frame);
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		const origin = { frame: marker.frame, duration: marker.duration };
		// Alt-dragging a point marker pulls a range out of it, a range's edge changes its length
		const dragMode =
			event.altKey && mode === "move" ? (origin.duration === 0 ? "span" : (edge ?? mode)) : mode;
		markerDrag = {
			id: marker.id,
			mode: dragMode,
			origin,
			grabFrame: frameAtClientX(event.clientX),
			current: origin,
		};
		// Dragging the end shows where the range stops, the rest where it starts
		seek(dragMode === "end" ? lastFrameOf(origin) : marker.frame);

		// On the window: the grabbed element goes away when the marker turns into a range or back
		const move = (moveEvent: PointerEvent) => moveMarkerDrag(moveEvent);
		const stop = (stopEvent: PointerEvent) => {
			window.removeEventListener("pointermove", move, true);
			window.removeEventListener("pointerup", stop, true);
			window.removeEventListener("pointercancel", stop, true);
			stopEvent.stopPropagation();
			if (stopEvent.type === "pointerup") void endMarkerDrag(marker);
			else markerDrag = null;
		};
		window.addEventListener("pointermove", move, true);
		window.addEventListener("pointerup", stop, true);
		window.addEventListener("pointercancel", stop, true);
	}

	function moveMarkerDrag(event: PointerEvent) {
		if (!markerDrag) return;
		// Keep the ruler from scrubbing and showing thumbnails meanwhile
		event.stopPropagation();
		const delta = frameAtClientX(event.clientX) - markerDrag.grabFrame;
		const { origin, mode } = markerDrag;
		markerDrag.current = dragRange(origin, mode, delta, { first: firstFrame, last: lastFrame });
		const { current } = markerDrag;
		// Follow the edge that is dragged
		const draggedEnd =
			mode === "end" || (mode === "span" && current.frame === origin.frame && current.duration > 0);
		seek(draggedEnd ? lastFrameOf(current) : current.frame);
	}

	async function endMarkerDrag(marker: ReviewMarker) {
		if (markerDrag?.id !== marker.id) return;
		const { frame, duration } = markerDrag.current;
		try {
			if (frame !== marker.frame || duration !== marker.duration) {
				const save = updateMarker({
					id: marker.id,
					name: marker.name ?? "",
					description: marker.description ?? "",
					categoryId: marker.categoryId,
					frame,
					duration,
					shareToken: share?.token,
				});
				// ⌘Z right after letting go waits for this move, then takes it back
				await (markerHistory?.track(save) ?? save);
				await getMarkers(markersKey(marker.exportId, share?.token)).refresh();
				for (const signal of dragSignals(marker, { frame, duration })) {
					signalGuide("marker-ranges", signal);
				}
			}
		} finally {
			markerDrag = null;
		}
	}

	// ─── In and out points ───
	// Out is inclusive like in the NLEs: the frame under the playhead belongs to the range
	export const marks = {
		markIn() {
			inOut = orderMarks({ in: playHeadPosition, out: inOut.out });
		},
		markOut() {
			inOut = orderMarks({ in: inOut.in, out: playHeadPosition });
		},
		clearMarks() {
			inOut = { in: null, out: null };
		},
	};

	let dragging = $state(false);
	let wasPlaying = false;

	let lastClientX = 0;
	function frameAtClientX(clientX: number) {
		// The rect moves with scrolling, so scrollLeft is already included
		const x = clientX - content!.getBoundingClientRect().left;
		return firstFrame + Math.floor(x / pixelsPerFrame);
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
		const x = toX(playHeadPosition);
		if (!lanes || dragging) return;
		if (x < lanes.scrollLeft || x > lanes.scrollLeft + lanes.clientWidth - 20) {
			lanes.scrollLeft = x - 20;
		}
	});

	// Keeps the anchor frame at the same place on screen
	async function setZoom(next: number, anchorFrame = playHeadPosition) {
		const offset = toX(anchorFrame) - (lanes?.scrollLeft ?? 0);
		zoom = Math.min(Math.max(next, 1), maxZoom);
		await tick();
		if (lanes) lanes.scrollLeft = toX(anchorFrame) - offset;
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

	// Keyboard actions, triggered by the page's global key handler
	export function stepFrames(direction: -1 | 1, bySecond: boolean) {
		seek(playHeadPosition + direction * (bySecond ? Math.round(fps) : 1));
	}
	export { seekToAdjacentMarker, seekToCut, changePlaybackRate };
	export function seekToStart() {
		seek(firstFrame);
	}
	export function seekToEnd() {
		seek(lastFrame);
	}

	onMount(async () => {
		// registers <media-thumbnail>; browser only
		await import("@videojs/html/ui/thumbnail");
		thumbnailReady = true;
	});

	// thumbnails has no attribute, and a property set before the element is defined would be lost
	$effect(() => {
		if (preview && thumbnailReady) preview.thumbnails = seekThumbnails;
	});
	$effect(() => {
		if (preview && thumbnailReady && hover) preview.time = hover.time;
	});

	function showPreview(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (!seekThumbnails || seekThumbnails.length === 0) return;
		const frame = clampFrame(frameAtClientX(event.clientX));
		const ruler = event.currentTarget.getBoundingClientRect();
		// time in the video, which starts at the timeline's first frame
		hover = { time: (frame - firstFrame) / fps, x: event.clientX, y: ruler.top };
	}
</script>

<!-- <pre>{JSON.stringify({ markers }, null, 2)}</pre> -->
<!-- Pointer events too: Alt may go down while another window has focus -->
<svelte:window
	onkeydown={trackAlt}
	onkeyup={trackAlt}
	onpointermove={trackAlt}
	onblur={() => (altHeld = false)}
/>
<div class="flex h-full flex-col">
	<div class="flex min-h-0 flex-1">
		<div
			bind:this={headers}
			class="w-32 shrink-0 overflow-hidden border-r border-base-300 bg-base-100"
		>
			<!-- The corner above the track names holds the zoom, so the timeline needs no toolbar -->
			<div
				class="sticky top-0 z-20 flex h-8 items-center gap-1.5 border-b border-base-300 bg-base-100 px-2"
			>
				<GuideButton guide="marker-ranges" />
				<ZoomIn class="size-3.5 shrink-0 text-base-content/60" aria-hidden="true" />
				<input
					type="range"
					min="0"
					max={Math.log(maxZoom)}
					step="0.01"
					value={Math.log(zoom)}
					oninput={(event) => setZoom(Math.exp(Number(event.currentTarget.value)))}
					class="range min-w-0 flex-1 range-primary range-xs"
					title="Zoom ({commandKeyLabel().replace(/\+$/, '')} + scroll or pinch)"
					aria-label="Zoom"
				/>
			</div>
			{#each tracks as track, index (track.id)}
				<div
					class="flex {laneHeight} items-center truncate px-2 text-sm {laneClass(tracks, index)}"
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
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="sticky top-0 z-20 h-[calc(2rem-1px)] cursor-ew-resize overflow-hidden bg-base-100 select-none"
					tabindex="-1"
					onpointerdown={startScrub}
					onpointerup={endScrub}
					onpointercancel={endScrub}
					onpointermove={(event) => {
						scrub(event);
						showPreview(event);
					}}
					onpointerleave={() => (hover = null)}
				>
					{#each ticks as tickFrame (tickFrame)}
						<div
							class="absolute top-0 h-full border-l border-base-content/20 pt-0.5 pl-1 font-mono text-xs leading-none text-base-content/60"
							style="left: {toX(tickFrame)}px"
						>
							{formatTimecode(tickFrame, snapshot.frameRate)}
						</div>
					{/each}

					<!-- In/out for the next marker: an area once both are set, otherwise a bracket -->
					{#if inOut.in !== null && inOut.out !== null}
						<div
							class="pointer-events-none absolute inset-y-0 border-x-2 border-dashed border-primary bg-primary/10"
							style="left: {toX(inOut.in)}px; width: {(inOut.out - inOut.in + 1) *
								pixelsPerFrame}px"
							title="In {formatTimecode(inOut.in, snapshot.frameRate)} · Out {formatTimecode(
								inOut.out,
								snapshot.frameRate,
							)}"
						></div>
					{:else if inOut.in !== null}
						<div
							class="pointer-events-none absolute inset-y-0 w-1.5 border-y-2 border-l-2 border-primary"
							style="left: {toX(inOut.in)}px"
						></div>
					{:else if inOut.out !== null}
						<div
							class="pointer-events-none absolute inset-y-0 -ml-1.5 w-1.5 border-y-2 border-r-2 border-primary"
							style="left: {toX(inOut.out + 1)}px"
						></div>
					{/if}

					{#each visibleMarkers as marker (marker.id)}
						{@const range = rangeOf(marker)}
						{@const width = range.duration * pixelsPerFrame}
						{@const guided = marker.canUpdate && marker.id === selectedMarkerId}
						<!-- The lane lines reach up under the icons, the icons' rounded tips stop short of the edge -->
						{#if range.duration > 0}
							{#each [toX(range.frame), toX(range.frame) + width - 1] as left, i (i)}
								<div
									class="pointer-events-none absolute bottom-0 h-2 border-l"
									style="left: {left}px; border-color: {marker.category.color}"
								></div>
							{/each}
						{:else}
							<div
								class="pointer-events-none absolute bottom-0 h-2 border border-l-2"
								style="left: {toX(range.frame)}px; border-color: {marker.category.color}"
							></div>
						{/if}
						{#if range.duration > 0}
							<!-- Range bar, centered on the icons: dragging it moves the range, its edges resize it -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute bottom-1 h-2 touch-none rounded-sm {marker.canUpdate
									? markerDrag?.id === marker.id
										? 'cursor-grabbing'
										: 'cursor-grab'
									: 'cursor-pointer'}"
								style="left: {toX(range.frame)}px; width: {Math.max(
									width,
									2,
								)}px; background-color: color-mix(in srgb, {marker.category
									.color} 50%, transparent)"
								title={marker.name}
								onpointerdown={(event) => startMarkerDrag(event, marker, "move")}
							>
								{#if marker.canUpdate && width >= HANDLE_MIN_WIDTH}
									{#each ["start", "end"] as const as edge (edge)}
										<div
											class="absolute -inset-y-1 w-2 cursor-ew-resize {edge === 'start'
												? '-left-1'
												: '-right-1'}"
											title={edge === "start"
												? "Drag to change the start"
												: "Drag to change the end"}
											onpointerdown={(event) => startMarkerDrag(event, marker, edge)}
										></div>
									{/each}
								{/if}
							</div>
						{/if}
						{#if range.duration > 0}
							<!-- A range has two equal edges: triangles whose flat side sits on the edge. The start
							triangle is the range's head in the marker-ranges tour (the bar can be 2px or wider
							than the timeline) -->
							{#each ["start", "end"] as const as edge (edge)}
								<div
									class="absolute bottom-0 z-10 touch-none {edge === 'end'
										? '-translate-x-full'
										: ''} {marker.canUpdate &&
									(markerDrag?.id === marker.id ? markerDrag.mode === edge : altHeld && !markerDrag)
										? 'cursor-ew-resize'
										: markerDrag?.id === marker.id
											? 'cursor-grabbing'
											: 'cursor-grab'}"
									style="left: {toX(range.frame) + (edge === 'end' ? width : 0)}px"
									data-guide={guided
										? `marker-ranges/${edge === "start" ? "move" : "end"}`
										: undefined}
									title={marker.canUpdate
										? `${marker.name ?? ""} · Alt-drag to change the ${edge}`
										: marker.name}
									onpointerdown={(event) => startMarkerDrag(event, marker, "move", edge)}
								>
									<RangeEdgeIcon {edge} fill={marker.category.color} strokeWidth={0} />
								</div>
							{/each}
						{:else}
							<div
								class="absolute bottom-0 z-10 -translate-x-1/2 touch-none {markerDrag?.id ===
								marker.id
									? 'cursor-grabbing'
									: 'cursor-grab'}"
								style="left: {toX(range.frame) + LINE_WIDTH / 2}px"
								title={marker.canUpdate
									? `${marker.name ?? ""} · Alt-drag for a range`
									: marker.name}
								data-guide={guided ? "marker-ranges/move" : undefined}
								onpointerdown={(event) => startMarkerDrag(event, marker)}
							>
								<!-- block: inline it would sit on the text baseline, above the ruler's edge -->
								<Diamond
									class="block"
									size={16}
									fill={marker.category.color}
									stroke="rgb(0 0 0 / 0.4)"
									strokeWidth={0}
								/>
							</div>
						{/if}
					{/each}

					<div
						class="pointer-events-none absolute bottom-0 -ml-1.5 border-x-[6px] border-t-8 border-x-transparent border-t-error"
						style="left: {toX(playHeadPosition)}px"
					></div>
				</div>
				<!-- The ruler's bottom line, apart from the ruler so the marker lines can cross it while the
				ruler still covers them when the lanes scroll up -->
				<div class="pointer-events-none sticky top-[calc(2rem-1px)] z-18 h-px bg-base-300"></div>

				{#each tracks as track, index (track.id)}
					<div class="relative {laneHeight} {laneClass(tracks, index)}">
						{#each track.clips as clip (clip.id)}
							<button
								type="button"
								class="absolute inset-y-1 cursor-pointer overflow-hidden rounded-sm border px-1 text-left text-xs text-ellipsis whitespace-nowrap"
								style="left: {toX(clip.startFrameIndex)}px; width: {clip.durationFrameCount *
									pixelsPerFrame}px; {clipStyle(clip, track.type)}"
								title={clip.name}
								onclick={() => seek(clip.startFrameIndex)}
							>
								{#if !collapsed}{clip.name}{/if}
							</button>
						{/each}
					</div>
				{/each}

				<div
					class="pointer-events-none absolute inset-y-0 left-0 z-30 w-px bg-error"
					style="transform: translateX({toX(playHeadPosition)}px)"
				></div>

				{#each markers as marker (marker.id)}
					{@const range = rangeOf(marker)}
					{#if range.duration > 0}
						<!-- Range over the lanes: only shown, clicks go through to the clips -->
						<div
							class="pointer-events-none absolute top-0 z-19 h-full border-r"
							style="left: {toX(range.frame)}px; width: {range.duration *
								pixelsPerFrame}px; background-color: color-mix(in srgb, {marker.category
								.color} 10%, transparent); border-color: {marker.category.color}"
						></div>
					{/if}
					<!-- A point marker gets a bold line, a range a thin one like its end -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="absolute top-0 z-19 h-full cursor-pointer {range.duration > 0
							? 'border-l'
							: 'border border-l-2'}"
						style="left: {toX(range.frame)}px; border-color: {marker.category.color}"
						title={marker.name}
						onclick={() => {
							seek(range.frame);
							onmarkerclick?.(marker.id);
						}}
					></div>
				{/each}
			</div>
		</div>
	</div>
	{#if thumbnailReady && hover}
		<!-- The element sets its own inline width/height to clip the sprite sheet to one tile. Moving it
		with a reactive style attribute would overwrite those, so only this wrapper is positioned. -->
		<div
			class="pointer-events-none fixed z-50"
			style="left: {hover.x - 80}px; top: {hover.y - 98}px"
		>
			<media-thumbnail bind:this={preview} class="rounded-sm shadow-lg"></media-thumbnail>
		</div>
	{/if}
</div>
