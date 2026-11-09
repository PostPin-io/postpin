<script lang="ts">
	import { onMount, tick } from "svelte";
	import { handleReviewShortcut } from "#lib/components/review/reviewShortcuts.ts";
	import {
		getExport,
		getMovieBarcode,
		getProcessingJobs,
		getSeekSprites,
		getShotThumbnails,
		getUrl,
	} from "./export.remote.ts";
	import NoteOverlay from "./NoteOverlay.svelte";
	import PageMeta from "#lib/components/PageMeta.svelte";
	import ShareHeader from "#lib/components/sharing/ShareHeader.svelte";
	import Timeline from "#lib/components/review/Timeline.svelte";
	import ShotGrid from "#lib/components/review/ShotGrid.svelte";
	import MovieBarcode from "#lib/components/review/MovieBarcode.svelte";

	import Header from "#lib/components/Header.svelte";
	import LoadingAnimation from "#lib/components/LoadingAnimation.svelte";
	import MarkerPanel from "#lib/components/review/MarkerPanel.svelte";
	import { markerFilter } from "#lib/components/review/markerFilter.svelte.ts";
	import VideoMenuBar from "#lib/components/review/VideoMenuBar.svelte";
	import VideoPlayer, { HLS, type VideoSource } from "#lib/components/review/VideoPlayer.svelte";
	import { Pane, Splitpanes } from "svelte-splitpanes";

	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { frameAtSeconds, secondsAtFrame } from "@postpin-io/shared/logic/timecode";
	import { getMarkers } from "#lib/components/review/MarkerPanel.remote.ts";
	import type { TimelineMode } from "#lib/components/review/VideoPlayer.ts";
	import {
		defaultLayout,
		normalizeSizes,
		parsePaneLayout,
		parseQuality,
		parseTimelineMode,
		seekThumbnailTiles,
		type PaneLayout,
	} from "#lib/components/review/exportView.ts";

	import CheckCircle from "@lucide/svelte/icons/check-circle";

	import { jobStateBadges } from "#lib/job-status.ts";

	/** Set on a share link: the same view, limited to what the link shows */
	type ShareContext = {
		token: string;
		exportName: string;
		guestName: string;
		note: string | null;
		timelinePanelVisible: boolean;
		markerPanelVisible: boolean;
	};

	interface Props {
		exportId: string;
		/** Team view: must match the export */
		projectId?: string;
		timelineId?: string;
		share?: ShareContext;
	}
	let { exportId, projectId, timelineId, share }: Props = $props();

	const shareToken = $derived(share?.token);
	// The note greets the guest; the header button hides and shows it again
	let noteVisible = $state(true);

	const STORAGE_KEY = "postpin:export-panes";

	// Guests start with the defaults and never overwrite the team's saved sizes
	function loadLayout(): PaneLayout {
		if (share || typeof localStorage === "undefined") return defaultLayout();
		try {
			return parsePaneLayout(localStorage.getItem(STORAGE_KEY));
		} catch {
			return defaultLayout();
		}
	}

	let layout = $state<PaneLayout>(loadLayout());

	function saveLayout(key: keyof PaneLayout, event: CustomEvent<{ size: number }[]>) {
		if (share) return;
		const sizes = event.detail.map((pane) => pane.size);

		// The collapsed timeline's fixed size must not overwrite the saved layout
		if (key === "left" && timelineMode !== "full") return;
		layout[key] = normalizeSizes(sizes);

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
		} catch (error) {
			console.error("Failed to save panel layout:", error);
		}
	}

	const isMarkerVisible = $derived(share?.markerPanelVisible ?? true);
	const isTimelineVisible = $derived(share?.timelinePanelVisible ?? true);

	const exportQuery = $derived(
		getExport(share ? { exportId, shareToken } : { projectId, timelineId, exportId }),
	);
	const processingJobsQuery = $derived(
		!share && exportQuery?.current?.media?.id
			? getProcessingJobs({ mediaId: exportQuery.current.media.id })
			: undefined,
	);

	const exp = $derived(await exportQuery);
	const media = $derived(exp?.media);

	let isMounted = $state(false);
	let isLayoutReady = $state(false);

	// A boolean, so the refetches while processing don't count as a change and reset the layout
	const hasExport = $derived(!!exp);
	let isLoading = $derived(!hasExport || !isMounted || !isLayoutReady);
	// Phase 7: the guest's own markers
	let allMarkers = $derived(share ? [] : await getMarkers(exportId));
	let markers = $derived(markerFilter.apply(allMarkers));
	let originalUrl = $state<string | undefined>(undefined);
	let thumbnailUrl = $state<string | undefined>(undefined);

	// The export is refetched every second while processing; depending on these values instead of `media` keeps that
	// from signing new URLs, and so reloading the video, on every refetch
	const mediaId = $derived(media?.id);
	const mediaStatus = $derived(media?.status);
	const hasThumbnail = $derived(!!media?.thumbnail);

	// the query 404s until the job is done, so only ask once the polled export says it is
	const shotThumbnails = $derived(
		media?.shotThumbnails && isTimelineVisible
			? getShotThumbnails({ mediaId: media.id, shareToken })
			: undefined,
	);

	$effect(() => {
		const id = mediaId;
		const withThumbnail = hasThumbnail;
		const token = shareToken;

		if (!id || mediaStatus === "PENDING") {
			originalUrl = undefined;
			thumbnailUrl = undefined;
			return;
		}

		let cancelled = false;

		async function loadUrls() {
			try {
				// Guests only stream HLS: no original
				const original = token ? undefined : await getUrl({ mediaId: id!, type: "original" });

				const thumbnail = withThumbnail
					? await getUrl({ mediaId: id!, type: "thumbnail", shareToken: token })
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
				// The export carries the media status and proxies the player depends on, so it has to be refetched
				// until processing is done; the job list only drives the progress display
				const status = exportQuery.current?.media?.status;
				if (status === "PENDING" || status === "PROCESSING") {
					await Promise.all([exportQuery.refresh(), processingJobsQuery?.refresh()]);
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
		if (!hasExport || !isMounted) {
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
		handleReviewShortcut(event, {
			timeline,
			player,
			togglePlayback: () => {
				videoPaused = !videoPaused;
				if (videoPaused) videoPlaybackRate = 1;
			},
		});
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
			? {
					src: `/media/${media.id}/master.m3u8${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ""}`,
					type: HLS,
				}
			: originalUrl
				? { src: originalUrl, type: "video/mp4" }
				: undefined,
	);

	const QUALITY_KEY = "postpin:video-quality";
	let videoQuality = $state<number | "auto">(loadQuality());

	function loadQuality(): number | "auto" {
		try {
			return parseQuality(localStorage.getItem(QUALITY_KEY));
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

	const spriteInfo = $derived(
		mediaId ? await getSeekSprites({ mediaId, shareToken }).catch(() => null) : null,
	);
	const seekThumbnails = $derived(
		spriteInfo?.seekSprites ? seekThumbnailTiles(spriteInfo.seekSprites, spriteInfo.urls) : [],
	);

	let viewMode: "shot-grid" | "timeline" = $state("timeline");
	const TIMELINE_MODE_KEY = "postpin:timeline-mode";
	function loadTimelineMode(): TimelineMode {
		if (typeof localStorage === "undefined") return "full";
		return parseTimelineMode(localStorage.getItem(TIMELINE_MODE_KEY));
	}
	let timelineMode = $state<TimelineMode>(loadTimelineMode());
	$effect(() => {
		try {
			localStorage.setItem(TIMELINE_MODE_KEY, timelineMode);
		} catch (error) {
			console.error("Failed to save timeline mode:", error);
		}
	});
	let timelineCollapsedHeight = $state(0);
	let leftPanesHeight = $state(0);
	// Compact and scrub-only timelines get exactly the space they need, in percent of the pane column
	const collapsedPercent = $derived(
		timelineMode !== "full" && leftPanesHeight > 0 && timelineCollapsedHeight > 0
			? Math.min((timelineCollapsedHeight / leftPanesHeight) * 100, 85)
			: undefined,
	);
	let player = $state<VideoPlayer>();
	let videoFullscreen = $state(false);
	let videoQualities = $state<number[]>([]);
	let videoMuted = $state(false);
</script>

<!-- The share page sets its own title -->
{#if !share}
	<PageMeta title={exp?.name ?? "Export"} description="Watch this export and review its markers." />
{/if}

<svelte:window onkeydown={onGlobalKeyDown} />

{#snippet shareHeader(share: ShareContext)}
	<ShareHeader
		exportName={share.exportName}
		guestName={share.guestName}
		hasNote={!!share.note}
		bind:noteVisible
	/>
{/snippet}

{#if isLoading}
	<div class="flex h-full min-h-0 flex-col overflow-hidden">
		{#if share}
			{@render shareHeader(share)}
		{:else}
			<Header />
		{/if}
		<div
			class=" flex h-full min-h-0 flex-1 items-center justify-center"
			role="status"
			aria-live="polite"
		>
			<div
				class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 text-center shadow-lg"
			>
				<LoadingAnimation class="size-24" />

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
		{#if share}
			{@render shareHeader(share)}
		{:else}
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
		{/if}

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
									{#snippet menuBar()}
										<VideoMenuBar
											{markers}
											timing={snapshot!}
											durationFrames={snapshot!.durationFrameCount}
											bind:currentTime={videoPosition}
											bind:paused={videoPaused}
											bind:playbackRate={videoPlaybackRate}
											bind:quality={videoQuality}
											bind:viewMode
											bind:timelineMode
											timelineControls={isTimelineVisible}
											qualities={videoQualities}
											muted={videoMuted}
											playerAvailable={viewMode === "timeline" && !!player}
											fullscreen={videoFullscreen}
											onToggleMute={() => player?.toggleMute()}
											onFullscreen={() => player?.toggleFullscreen()}
										/>
									{/snippet}
									{#snippet note()}
										{#if share?.note && noteVisible}
											<NoteOverlay note={share.note} onclose={() => (noteVisible = false)} />
										{/if}
									{/snippet}
									<div class="min-h-0 flex-1 overflow-hidden">
										{#if viewMode === "shot-grid" && snapshot}
											<ShotGrid
												{snapshot}
												thumbnailUrls={shotThumbnails?.current?.urls}
												{currentFrame}
												onSeek={seekToFrame}
											/>
										{:else if media.status !== "PENDING" && videoSource && snapshot}
											<!-- A fresh player when the source switches between the original and HLS -->
											{#key videoSource.type}
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
													bind:fullscreen={videoFullscreen}
													fullscreenControls={menuBar}
													overlay={note}
												/>
											{/key}
										{:else if viewMode !== "shot-grid" && media.status !== "FAILED"}
											<div
												class="flex h-full items-center justify-center"
												role="status"
												aria-live="polite"
											>
												<LoadingAnimation class="size-24" />
											</div>
										{/if}
									</div>
									{#if snapshot}
										{@render menuBar()}
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
										mode={timelineMode}
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
					<!-- The barcode belongs to the timeline: guests only get it with the timeline panel -->
					{#if isTimelineVisible && media}
						{@const barcode = await getMovieBarcode({ mediaId: media.id, shareToken })}
						{#if barcode}
							<MovieBarcode data={barcode} />
						{/if}
					{/if}
					{#if share}
						<!-- Phase 7: the guest's own markers -->
						<div class="flex flex-1 items-center justify-center p-4 text-sm text-base-content/50">
							Your markers will appear here.
						</div>
					{:else}
						<MarkerPanel
							{currentFrame}
							onseek={seekToFrame}
							startFrame={snapshot!.startFrameIndex}
							frameRate={snapshot!.frameRate}
							frameCount={snapshot!.durationFrameCount}
						/>
					{/if}
				</Pane>
			{/if}
		</Splitpanes>
	</div>
{/if}
