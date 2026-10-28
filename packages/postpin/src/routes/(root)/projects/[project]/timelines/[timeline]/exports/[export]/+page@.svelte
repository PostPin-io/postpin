<script lang="ts">
	import { onMount, tick } from "svelte";
	import { isInsideOverlay, isPlainKey, isTypingTarget } from "#lib/keyboard.ts";
	import { page } from "$app/state";
	import {
		getExport,
		getMovieBarcode,
		getProcessingJobs,
		getSeekSprites,
		getUrl,
	} from "./export.remote";

	import Header from "#lib/components/Header.svelte";
	import MarkerPanel from "#lib/components/review/MarkerPanel.svelte";
	import { markerFilter } from "#lib/components/review/markerFilter.svelte.ts";
	import VideoMenuBar from "#lib/components/review/VideoMenuBar.svelte";
	import VideoPlayer, { HLS, type VideoSource } from "#lib/components/review/VideoPlayer.svelte";
	import { Pane, Splitpanes } from "svelte-splitpanes";
	import Timeline from "./Timeline.svelte";
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import {
		frameAtSeconds,
		secondsAtFrame,
	} from "../../../../../../../../../../shared/src/logic/timecode";
	import { getMarkers } from "#lib/components/review/MarkerPanel.remote.ts";
	import type { ThumbnailImage } from "@videojs/html";
	import { seekSprites as seekSpritesSchema } from "@postpin-io/shared/types/SeekSprites";
	import * as v from "valibot";
	import Hourglass from "@lucide/svelte/icons/hourglass";
	import { jobStateBadges } from "../../../../../../queuetests/job-status";
	import CheckCircle from "@lucide/svelte/icons/check-circle";
	import ShotGrid from "./ShotGrid.svelte";
	import MovieBarcode from "./MovieBarcode.svelte";

	const STORAGE_KEY = "postpin:export-panes";

	const defaults = {
		main: [75, 25],
		left: [65, 35],
	};

	type PaneLayout = {
		main: number[];
		left: number[];
	};

	function loadLayout(): PaneLayout {
		if (typeof localStorage === "undefined") {
			return {
				main: [...defaults.main],
				left: [...defaults.left],
			};
		}

		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");

			const valid = (sizes: unknown, count: number): sizes is number[] =>
				Array.isArray(sizes) &&
				sizes.length === count &&
				sizes.every((size) => typeof size === "number" && Number.isFinite(size) && size >= 0) &&
				sizes.reduce((sum, size) => sum + size, 0) > 0;

			return {
				main: valid(saved?.main, 2) ? [...saved.main] : [...defaults.main],
				left: valid(saved?.left, 2) ? [...saved.left] : [...defaults.left],
			};
		} catch {
			return {
				main: [...defaults.main],
				left: [...defaults.left],
			};
		}
	}

	let layout = $state<PaneLayout>(loadLayout());

	function normalizeSizes(sizes: number[]): number[] {
		const total = sizes.reduce((sum, size) => sum + size, 0);

		if (total <= 0) {
			return sizes.map(() => 100 / sizes.length);
		}

		return sizes.map((size) => (size / total) * 100);
	}

	function saveLayout(key: keyof PaneLayout, event: CustomEvent<{ size: number }[]>) {
		const sizes = event.detail.map((pane) => pane.size);

		// The collapsed timeline's fixed size must not overwrite the saved layout
		if (key === "left" && timelineCollapsed) return;
		layout[key] = normalizeSizes(sizes);

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
		} catch (error) {
			console.error("Failed to save panel layout:", error);
		}
	}

	let isMarkerVisible = $state(true);
	let isTimelineVisible = $state(true);

	function toggleMarkerPanel() {
		isMarkerVisible = !isMarkerVisible;

		if (isMarkerVisible) {
			layout.main = [...defaults.main];
		} else {
			layout.main = [100, 0];
		}
	}

	function toggleTimelinePanel() {
		isTimelineVisible = !isTimelineVisible;

		if (isTimelineVisible) {
			layout.left = [...defaults.left];
		} else {
			layout.left = [100, 0];
		}
	}

	const exportQuery = $derived(
		getExport({
			projectId: page.params.project ?? "",
			timelineId: page.params.timeline ?? "",
			exportId: page.params.export ?? "",
		}),
	);
	const processingJobsQuery = $derived(
		exportQuery?.current?.media?.id
			? getProcessingJobs({ mediaId: exportQuery.current.media.id })
			: undefined,
	);

	const exp = $derived(await exportQuery);
	const media = $derived(exp?.media);

	let isMounted = $state(false);
	let isLayoutReady = $state(false);

	let isLoading = $derived(!exp || !isMounted || !isLayoutReady);
	let allMarkers = $derived(await getMarkers(page.params.export ?? ""));
	let markers = $derived(markerFilter.apply(allMarkers));
	let originalUrl = $state<string | undefined>(undefined);
	let thumbnailUrl = $state<string | undefined>(undefined);

	// The export is refetched every second while processing; depending on these values instead of `media` keeps that
	// from signing new URLs, and so reloading the video, on every refetch
	const mediaId = $derived(media?.id);
	const mediaStatus = $derived(media?.status);
	const hasThumbnail = $derived(!!media?.thumbnail);

	$effect(() => {
		const id = mediaId;
		const withThumbnail = hasThumbnail;

		if (!id || mediaStatus === "PENDING") {
			originalUrl = undefined;
			thumbnailUrl = undefined;
			return;
		}

		let cancelled = false;

		async function loadUrls() {
			try {
				const original = await getUrl({
					mediaId: id!,
					type: "original",
				});

				const thumbnail = withThumbnail
					? await getUrl({
							mediaId: id!,
							type: "thumbnail",
						})
					: undefined;

				if (!cancelled) {
					originalUrl = original;
					thumbnailUrl = thumbnail;
				}
			} catch (error) {
				console.error("Failed to load media URLs:", error);

				if (!cancelled) {
					originalUrl = undefined;
					thumbnailUrl = undefined;
				}
			}
		}

		void loadUrls();

		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		isMounted = true;

		const interval = setInterval(async () => {
			try {
				const current = processingJobsQuery?.current;
				if (current?.some((job) => job.state === "active" || job.state === "waiting")) {
					await processingJobsQuery?.refresh();
				}
			} catch (error) {
				console.error("Failed to refresh export:", error);
			}
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});

	// Mount Splitpanes first, then allow the page to become visible.
	$effect(() => {
		if (!exp || !isMounted) {
			isLayoutReady = false;
			return;
		}

		let cancelled = false;

		async function initializeLayout() {
			isLayoutReady = false;

			await tick();

			// Allow the browser to calculate the container dimensions.
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});

			if (!cancelled) {
				isLayoutReady = true;
			}
		}

		void initializeLayout();

		return () => {
			cancelled = true;
		};
	});

	let videoPosition = $state(0);
	let videoPaused = $state(true);
	let videoPlaybackRate = $state(1);

	let timeline = $state<Timeline>();

	// Single global keyboard handler. Shortcuts work wherever focus is, except while typing or
	// inside modals. Components with their own shortcuts (MarkerPanel) skip the same targets.
	function onGlobalKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented || !isPlainKey(event, { allowMeta: true })) return;
		if (isTypingTarget(event) || isInsideOverlay(event)) return;

		const step = (direction: -1 | 1) => timeline?.stepFrames(direction, event.shiftKey);
		switch (event.key) {
			case " ":
				// preventDefault also stops the native click on a focused button
				if (event.repeat || event.metaKey) return;
				videoPaused = !videoPaused;
				if (videoPaused) videoPlaybackRate = 1;
				break;
			case "ArrowLeft":
				if (event.metaKey) step(-1);
				else timeline?.seekToAdjacentMarker(-1);
				break;
			case "ArrowRight":
				if (event.metaKey) step(1);
				else timeline?.seekToAdjacentMarker(1);
				break;
			case "ArrowUp":
				timeline?.seekToCut(-1);
				break;
			case "ArrowDown":
				timeline?.seekToCut(1);
				break;
			case "Home":
				timeline?.seekToStart();
				break;
			case "End":
				timeline?.seekToEnd();
				break;
			case "+":
			case "-":
				if (event.metaKey) return;
				timeline?.changePlaybackRate(event.key === "+" ? 1 : -1);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	const snapshot = $derived(exportQuery.current?.timelineSnapshot as TimelineSnapshot | undefined);
	// Absolute timeline frame, like marker frames
	const currentFrame = $derived(snapshot ? frameAtSeconds(videoPosition, snapshot) : 0);
	const seekToFrame = (frame: number) => {
		if (snapshot) videoPosition = secondsAtFrame(frame, snapshot);
	};

	// HLS as soon as one rendition is ready, the original until then
	const hlsReady = $derived(
		media?.proxies.some((proxy) => proxy.status === "COMPLETED" && proxy.hasHls) ?? false,
	);
	const videoSource = $derived<VideoSource | undefined>(
		media && hlsReady
			? { src: `/media/${media.id}/master.m3u8`, type: HLS }
			: originalUrl
				? { src: originalUrl, type: "video/mp4" }
				: undefined,
	);

	const QUALITY_KEY = "postpin:video-quality";
	let videoQuality = $state<number | "auto">(loadQuality());

	function loadQuality(): number | "auto" {
		try {
			const saved = Number(localStorage.getItem(QUALITY_KEY));
			return saved > 0 ? saved : "auto";
		} catch {
			return "auto";
		}
	}

	$effect(() => {
		const quality = videoQuality;
		try {
			localStorage.setItem(QUALITY_KEY, String(quality));
		} catch {
			// private mode or blocked storage: the choice just isn't remembered
		}
	});

	const spriteInfo = $derived(mediaId ? await getSeekSprites({ mediaId }).catch(() => null) : null);
	const seekThumbnails = $derived.by((): ThumbnailImage[] => {
		if (!spriteInfo) return [];
		const { seekSprites, urls: spriteUrls } = spriteInfo;
		if (!seekSprites || spriteUrls.length === 0) return [];
		const perSheet = spriteInfo.seekSprites.columns * spriteInfo.seekSprites.rows;
		return Array.from({ length: spriteInfo.seekSprites.count }, (_, i) => ({
			url: spriteUrls[Math.floor(i / perSheet)]!,
			startTime: i * spriteInfo.seekSprites.interval,
			endTime: (i + 1) * spriteInfo.seekSprites.interval,
			width: spriteInfo.seekSprites.tileWidth,
			height: spriteInfo.seekSprites.tileHeight,
			coords: {
				x: (i % spriteInfo.seekSprites.columns) * spriteInfo.seekSprites.tileWidth,
				y:
					Math.floor((i % perSheet) / spriteInfo.seekSprites.columns) *
					spriteInfo.seekSprites.tileHeight,
			},
		}));
	});

	let viewMode: "shot-grid" | "timeline" = $state("timeline");
	const COLLAPSED_KEY = "postpin:timeline-collapsed";
	let timelineCollapsed = $state(
		typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "true",
	);
	$effect(() => {
		try {
			localStorage.setItem(COLLAPSED_KEY, String(timelineCollapsed));
		} catch (error) {
			console.error("Failed to save timeline collapse state:", error);
		}
	});
	let timelineCollapsedHeight = $state(0);
	let leftPanesHeight = $state(0);
	// Collapsed timeline gets exactly the space it needs, in percent of the pane column
	const collapsedPercent = $derived(
		timelineCollapsed && leftPanesHeight > 0 && timelineCollapsedHeight > 0
			? Math.min((timelineCollapsedHeight / leftPanesHeight) * 100, 85)
			: undefined,
	);
	let player = $state<VideoPlayer>();
	let videoQualities = $state<number[]>([]);
	let videoMuted = $state(false);
</script>

<svelte:window onkeydown={onGlobalKeyDown} />

{#if isLoading}
	<div class="flex h-full min-h-0 flex-col overflow-hidden">
		<Header />
		<div
			class=" flex h-full min-h-0 flex-1 items-center justify-center"
			role="status"
			aria-live="polite"
		>
			<div
				class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 text-center shadow-lg"
			>
				<span class="loading loading-lg loading-spinner text-primary" aria-hidden="true"></span>

				<div>
					<p class="text-lg font-semibold">Loading export</p>

					<p class="mt-1 text-sm text-base-content/70">
						Please wait while we get everything ready.
					</p>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="flex h-full min-h-0 flex-col overflow-hidden">
		<Header>
			{@const totalProgress =
				((processingJobsQuery?.current?.reduce(
					(sum, job) =>
						sum +
						(job.state === "active" || job.state === "waiting"
							? (job.progress ?? 0.5)
							: job.state === "completed"
								? 1
								: 0) *
							job.weight,
					0,
				) ?? 0) /
					(processingJobsQuery?.current?.reduce((sum, job) => sum + job.weight, 0) ?? 1)) *
				100}
			{#if media}
				<details class="dropdown">
					<summary class="btn m-1">
						{#if totalProgress < 100}
							<div
								class="radial-progress"
								style="--value:{totalProgress}; --size:1.5rem; --thickness: 3px;"
							>
								<!-- <Hourglass size={12} /> -->
							</div>
						{:else}
							<CheckCircle size={16} />
						{/if}
					</summary>
					<ul class="list dropdown-content card z-1 w-60 rounded-box bg-base-100 p-2 shadow-sm">
						{#each processingJobsQuery?.current as job (job.id)}
							{@const Icon = jobStateBadges[job.state ?? "unknown"].icon}
							<li class="list-row">
								<div class="{jobStateBadges[job.state ?? 'unknown'].color} w-4">
									{#if job.state === "active"}
										<div
											class="radial-progress"
											style="--value:{job.progress * 100}; --size:1rem; --thickness: 2px;"
										></div>
									{:else}
										<Icon size={16} />
									{/if}
								</div>
								<div>
									<span class="ml-2 font-semibold text-nowrap">{job.label}</span>
								</div>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</Header>

		<Splitpanes
			theme="daisy-theme"
			class="min-h-0 flex-1"
			on:resized={(event) => saveLayout("main", event)}
		>
			<!-- Main content -->
			<Pane size={layout.main[0]} minSize={isMarkerVisible ? 25 : 100} class="overflow-auto">
				<div class="h-full" bind:clientHeight={leftPanesHeight}>
					<Splitpanes
						theme="daisy-theme"
						horizontal
						on:resized={(event) => saveLayout("left", event)}
					>
						<!-- Video and jobs -->
						<Pane
							size={collapsedPercent !== undefined ? 100 - collapsedPercent : layout.left[0]}
							minSize={isTimelineVisible ? 15 : 100}
							class="overflow-auto"
						>
							<div class="flex h-full min-h-0 flex-col">
								{#if !media}
									<p>Nothing uploaded yet.</p>
								{:else}
									<div class="min-h-0 flex-1 overflow-hidden">
										{#if viewMode === "shot-grid" && snapshot}
											<ShotGrid
												{snapshot}
												mediaId={media.id}
												thumbnailsReady={!!media.shotThumbnails}
												{currentFrame}
												onSeek={seekToFrame}
											/>
										{:else if media.status !== "PENDING" && videoSource && snapshot}
											<VideoPlayer
												bind:this={player}
												source={videoSource}
												poster={thumbnailUrl}
												timing={snapshot}
												bind:currentTime={videoPosition}
												bind:paused={videoPaused}
												bind:playbackRate={videoPlaybackRate}
												bind:quality={videoQuality}
												bind:qualities={videoQualities}
												bind:muted={videoMuted}
											/>
										{/if}
									</div>
									{#if snapshot}
										<VideoMenuBar
											{markers}
											timing={snapshot}
											bind:currentTime={videoPosition}
											bind:paused={videoPaused}
											bind:playbackRate={videoPlaybackRate}
											bind:quality={videoQuality}
											bind:viewMode
											bind:timelineCollapsed
											qualities={videoQualities}
											muted={videoMuted}
											playerAvailable={viewMode === "timeline" && !!player}
											onToggleMute={() => player?.toggleMute()}
											onFullscreen={() => player?.requestFullscreen()}
										/>
									{/if}
								{/if}
							</div>
						</Pane>

						<!-- Timeline panel -->
						{#if isTimelineVisible}
							<Pane
								size={collapsedPercent ?? layout.left[1]}
								minSize={collapsedPercent ?? 10}
								maxSize={collapsedPercent ?? 100}
								class="overflow-hidden"
							>
								{#if exportQuery.current?.timelineSnapshot}
									<Timeline
										bind:this={timeline}
										snapshot={exportQuery.current!.timelineSnapshot as TimelineSnapshot}
										{markers}
										{seekThumbnails}
										collapsed={timelineCollapsed}
										onCollapsedHeight={(height) => (timelineCollapsedHeight = height)}
										bind:videoPositionSeconds={videoPosition}
										bind:paused={videoPaused}
										bind:playbackRate={videoPlaybackRate}
									/>
								{/if}

								<!-- Timeline content -->
							</Pane>
						{/if}
					</Splitpanes>
				</div>
			</Pane>

			<!-- Marker panel -->
			{#if isMarkerVisible}
				<Pane size={layout.main[1]} minSize={20} maxSize={50} class="flex flex-col overflow-hidden">
					{#if true}
						{@const barcode = await getMovieBarcode({
							mediaId: media?.id ?? "",
						})}
						{#if barcode}
							<MovieBarcode data={barcode} />
						{/if}
					{/if}
					<MarkerPanel
						{currentFrame}
						onseek={seekToFrame}
						startFrame={snapshot!.startFrameIndex}
						frameRate={snapshot!.frameRate}
					/>
				</Pane>
			{/if}
		</Splitpanes>
	</div>
{/if}
