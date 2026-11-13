<script lang="ts">
	import { onMount, tick, untrack } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { handleReviewShortcut } from "#lib/components/review/review-shortcuts.ts";
	import {
		getExport,
		getMovieBarcode,
		getProcessingJobs,
		getSeekSprites,
		getShotThumbnails,
		getUrl,
	} from "./export-view.remote.ts";
	import NoteOverlay from "./NoteOverlay.svelte";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import ShareHeader from "#lib/components/share-view/ShareHeader.svelte";
	import Timeline from "#lib/components/review/Timeline.svelte";
	import ShotGrid from "#lib/components/review/ShotGrid.svelte";
	import MovieBarcode from "#lib/components/review/MovieBarcode.svelte";

	import Header from "#lib/components/layout/Header.svelte";
	import LoadingAnimation from "#lib/components/layout/LoadingAnimation.svelte";
	import MarkerPanel from "#lib/components/review/markers/MarkerPanel.svelte";
	import { markerFilter } from "#lib/components/review/markers/marker-filter.svelte.ts";
	import VideoMenuBar from "#lib/components/review/VideoMenuBar.svelte";
	import VideoPlayer, { HLS, type VideoSource } from "#lib/components/review/VideoPlayer.svelte";
	import { Pane, Splitpanes } from "svelte-splitpanes";

	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { frameAtSeconds, secondsAtFrame } from "@postpin-io/shared/logic/timecode";
	import { getMarkers, getCategories } from "#lib/components/review/markers/markers.remote.ts";
	import { defaultCategory } from "#lib/components/review/markers/default-category.svelte.ts";
	import type { TimelineMode } from "#lib/components/review/video-player.ts";
	import type { InOut } from "#lib/components/review/timeline-view.ts";
	import {
		defaultLayout,
		normalizeSizes,
		parsePaneLayout,
		parseQuality,
		parseTimelineMode,
		seekThumbnailTiles,
		type PaneLayout,
	} from "#lib/components/review/export-view.ts";

	import ProcessingJobs from "#lib/components/review/ProcessingJobs.svelte";
	import EstimatedCuts from "#lib/components/review/EstimatedCuts.svelte";
	import { isWebUpload } from "@postpin-io/shared/logic/web-upload";
	import {
		readyShotThumbnails,
		shotThumbnailsPending,
		type ShotThumbnails,
	} from "@postpin-io/shared/types/ShotThumbnails";
	import { mergeShotUrls } from "./shot-thumbnail-urls.ts";
	import { isJobRunning } from "#lib/job-status.ts";

	import { setShareContext, type ShareContext } from "./share-context.ts";
	import { markersKey } from "./markers/marker-scope.ts";

	interface Props {
		exportId: string;
		/** Team view: must match the export */
		projectId?: string;
		timelineId?: string;
		share?: ShareContext;
	}
	let { exportId, projectId, timelineId, share }: Props = $props();
	setShareContext(() => share);

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
	// Phones and small tablets: video on top, marker panel below, no timeline
	const isMobile = new MediaQuery("max-width: 1023px");
	const showTimeline = $derived(isTimelineVisible && !isMobile.current);

	// A phone turned sideways: not just narrow and wide, which a small desktop window is too
	const isPhoneLandscape = new MediaQuery(
		"(orientation: landscape) and (max-height: 500px) and (pointer: coarse)",
	);
	// A phone turned sideways: the video fills the visible page (Safari's bars stay)
	const cssFullscreen = $derived(isPhoneLandscape.current);

	function toggleFullscreen() {
		// Leave real fullscreen, or enter it where the page may: desktop and Android, with our controls
		if (videoFullscreen || document.fullscreenEnabled) player?.toggleFullscreen();
		// iPhone: no fullscreen for elements, only for the video. The system player takes the whole
		// screen, without Safari's bars, but also without our controls and markers.
		else player?.enterNativeFullscreen();
	}

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
	// A render of the shot thumbnails that fails never publishes its generation; stop polling for
	// it at some point. Not state: only the polling interval reads it
	const SHOT_THUMBNAILS_MAX_WAIT = 5 * 60 * 1000;
	let shotThumbnailsWaitStart: number | null = null;
	let isLayoutReady = $state(false);

	// A boolean, so the refetches while processing don't count as a change and reset the layout
	const hasExport = $derived(!!exp);
	let isLoading = $derived(!hasExport || !isMounted || !isLayoutReady);
	// Guests without the marker panel: no markers at all (the server would answer 403)
	let allMarkers = $derived(
		isMarkerVisible ? await getMarkers(markersKey(exportId, shareToken)) : [],
	);
	let markers = $derived(markerFilter.apply(allMarkers));
	// Team only: guests have no categories. New markers don't default to the guest category
	const creatableCategories = $derived(
		!share && projectId ? (await getCategories(projectId)).filter((c) => !c.isGuest) : [],
	);
	const newMarkerColor = $derived(
		(creatableCategories.find((c) => c.id === defaultCategory.id) ?? creatableCategories[0])?.color,
	);
	let markerPanel = $state<MarkerPanel>();
	let originalUrl = $state<string | undefined>(undefined);
	let thumbnailUrl = $state<string | undefined>(undefined);

	// The export is refetched every second while processing; depending on these values instead of `media` keeps that
	// from signing new URLs, and so reloading the video, on every refetch
	const mediaId = $derived(media?.id);
	const mediaStatus = $derived(media?.status);
	const hasThumbnail = $derived(!!media?.thumbnail);
	const hasSeekSprites = $derived(!!media?.seekSprites);

	// The query 404s until the job published something, so only ask once the polled export says
	// it did. While the render runs, the job publishes how many images are ready.
	const publishedShots = $derived(media?.shotThumbnails as ShotThumbnails | null | undefined);
	const shotThumbnails = $derived(
		publishedShots && isTimelineVisible
			? getShotThumbnails({ mediaId: media!.id, shareToken, generation: publishedShots.generation })
			: undefined,
	);
	const shotsKey = $derived(publishedShots ? `${media!.id}:${publishedShots.generation}` : null);
	const shotsReady = $derived(publishedShots ? readyShotThumbnails(publishedShots) : 0);
	// More images are ready: ask the same query again; it shows the previous answer meanwhile.
	// Plain variable: only this effect reads it
	let askedFor: { key: string; ready: number } | null = null;
	$effect(() => {
		const key = shotsKey;
		const ready = shotsReady;
		untrack(() => {
			if (!key || !shotThumbnails) return void (askedFor = null);
			// the first answer of this generation is on its way already
			if (askedFor?.key === key && askedFor.ready !== ready) void shotThumbnails.refresh();
			askedFor = { key, ready };
		});
	});
	/** Per shot, null while its image is missing; the URLs of images already shown stay */
	let shotUrls = $state<(string | null)[] | undefined>();
	let shotUrlsKey: string | null = null;
	$effect(() => {
		const urls = shotThumbnails?.current?.urls;
		const key = shotsKey;
		untrack(() => {
			if (!key) {
				shotUrls = undefined;
				shotUrlsKey = null;
			} else if (urls) {
				shotUrls = mergeShotUrls(shotUrlsKey === key ? shotUrls : undefined, urls);
				shotUrlsKey = key;
			}
		});
	});

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
				// The export carries the media status, proxies, thumbnail, seek sprites and shot thumbnails, so it
				// has to be refetched until processing is done. The media is marked COMPLETED as soon as it can play,
				// while the sprite and thumbnail jobs still run, so keep going until every job has finished too.
				// After the cuts changed, the shot thumbnails of the new generation are on their way. Read
				// from the refreshed export, so it ends exactly when that generation is published.
				const current = exportQuery.current?.media;
				const status = current?.status;
				const jobsRunning = processingJobsQuery?.current?.some(isJobRunning);
				const shotsPending = !!current && shotThumbnailsPending(current);
				if (!shotsPending) shotThumbnailsWaitStart = null;
				else shotThumbnailsWaitStart ??= Date.now();
				const awaitingShots =
					shotsPending && Date.now() - shotThumbnailsWaitStart! < SHOT_THUMBNAILS_MAX_WAIT;
				if (status === "PENDING" || status === "PROCESSING" || jobsRunning || awaitingShots) {
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
	// Set in the timeline with I and O, used by the marker panel for the next marker
	let inOut = $state<InOut>({ in: null, out: null });

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

	// From the awaited export like `exp`/`media`: `.current` is set outside the navigation's async
	// batch, so after a quick switch it could still belong to the previous export
	const snapshot = $derived(exp?.timelineSnapshot as TimelineSnapshot | undefined);
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

	// Only ask once the export says the sprites exist: the query 404s before. No `.catch()` on the
	// query here: inside an async derived it trips a Svelte invariant ("Batch has scheduled effects")
	const spriteInfo = $derived(
		mediaId && hasSeekSprites ? await getSeekSprites({ mediaId, shareToken }) : null,
	);
	const seekThumbnails = $derived(
		spriteInfo?.seekSprites ? seekThumbnailTiles(spriteInfo.seekSprites, spriteInfo.urls) : [],
	);

	let viewMode: "shot-grid" | "timeline" = $state("timeline");
	// The shot grid needs the timeline's space: back to the video on phones
	$effect(() => {
		if (isMobile.current) viewMode = "timeline";
	});

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

<!-- The three areas of the review, rendered by the desktop split panes and the phone layout -->
{#snippet videoArea(compact = false)}
	<div class="flex min-h-0 flex-col {compact ? '' : 'h-full'}">
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
					timelineControls={showTimeline}
					mobile={isMobile.current}
					mobileLandscape={isPhoneLandscape.current}
					qualities={videoQualities}
					muted={videoMuted}
					playerAvailable={viewMode === "timeline" && !!player}
					fullscreen={videoFullscreen || cssFullscreen}
					fullscreenActive={videoFullscreen}
					onToggleMute={() => player?.toggleMute()}
					onFullscreen={toggleFullscreen}
					onCreateMarker={isMarkerVisible
						? () => void markerPanel?.createMarkerAtPlayhead()
						: undefined}
					markerColor={newMarkerColor}
					status={jobStatus}
				/>
			{/snippet}
			{#snippet jobStatus()}
				{#if processingJobsQuery?.current?.length}
					<ProcessingJobs jobs={processingJobsQuery.current} variant="compact" />
				{/if}
				{#if isWebUpload(snapshot) && !share}
					<EstimatedCuts
						{exportId}
						cutLevel={snapshot.metadata.cutLevel}
						detected={!!media.hasSceneScores}
						canChange={!!exp?.canChangeCuts && media.status === "COMPLETED"}
						cutsFrom={snapshot.metadata.cutsFrom ?? null}
						trackCount={snapshot.tracks.length}
						clipCount={snapshot.tracks
							.filter((t) => t.type === "video")
							.reduce((n, t) => n + t.clips.length, 0)}
						cutListError={exp?.cutList?.error ?? null}
						frameRate={snapshot.frameRate}
						onchanged={async () => {
							// brings the new generation; polling runs until it is published
							await exportQuery.refresh();
						}}
					/>
				{/if}
			{/snippet}
			{#snippet note()}
				{#if share?.note && noteVisible}
					<NoteOverlay note={share.note} onclose={() => (noteVisible = false)} />
				{/if}
			{/snippet}
			<div
				class={compact ? "aspect-video w-full overflow-hidden" : "min-h-0 flex-1 overflow-hidden"}
			>
				{#if viewMode === "shot-grid" && snapshot}
					<ShotGrid {snapshot} thumbnailUrls={shotUrls} {currentFrame} onSeek={seekToFrame} />
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
							{cssFullscreen}
							fullscreenControls={menuBar}
							overlay={note}
						/>
					{/key}
				{:else if viewMode !== "shot-grid" && media.status !== "FAILED"}
					{#if processingJobsQuery?.current?.length}
						<ProcessingJobs jobs={processingJobsQuery.current} variant="inline" />
					{:else}
						<div class="flex h-full items-center justify-center" role="status" aria-live="polite">
							<LoadingAnimation class="size-24" />
						</div>
					{/if}
				{/if}
			</div>
			{#if snapshot && !cssFullscreen}
				{@render menuBar()}
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet timelineArea()}
	{#if snapshot}
		<Timeline
			bind:this={timeline}
			snapshot={snapshot!}
			{markers}
			{seekThumbnails}
			mode={timelineMode}
			bind:inOut
			onCollapsedHeight={(height) => (timelineCollapsedHeight = height)}
			bind:videoPositionSeconds={videoPosition}
			bind:paused={videoPaused}
			bind:playbackRate={videoPlaybackRate}
		/>
	{/if}
{/snippet}

{#snippet markerArea(withBarcode = true)}
	<!-- The barcode belongs to the timeline: guests only get it with the timeline panel -->
	{#if withBarcode && isTimelineVisible && media}
		{@const barcode = await getMovieBarcode({ mediaId: media.id, shareToken })}
		{#if barcode}
			<MovieBarcode data={barcode} />
		{/if}
	{/if}
	<MarkerPanel
		bind:this={markerPanel}
		{exportId}
		mobile={isMobile.current}
		{currentFrame}
		{inOut}
		onrangeused={() => (inOut = { in: null, out: null })}
		onseek={seekToFrame}
		startFrame={snapshot!.startFrameIndex}
		frameRate={snapshot!.frameRate}
		frameCount={snapshot!.durationFrameCount}
	/>
{/snippet}

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
			<Header />
		{/if}
		{#if isMobile.current}
			<!-- Phones: the video stays on top, the marker panel below scrolls on its own -->
			<div class="flex min-h-0 flex-1 flex-col">
				<div class="shrink-0">
					{@render videoArea(true)}
				</div>
				{#if isMarkerVisible}
					<div class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-base-300">
						{@render markerArea(false)}
					</div>
				{/if}
			</div>
		{:else}
			<Splitpanes
				theme="daisy-theme"
				class="min-h-0 flex-1"
				on:resized={(event) => saveLayout("main", event)}
			>
				<!-- Main content; without the marker panel the video column takes the full width -->
				<Pane
					size={isMarkerVisible ? layout.main[0] : 100}
					minSize={isMarkerVisible ? 25 : 100}
					class="overflow-auto"
				>
					<div class="h-full" bind:clientHeight={leftPanesHeight}>
						<Splitpanes
							theme="daisy-theme"
							horizontal
							on:resized={(event) => saveLayout("left", event)}
						>
							<!-- Video and jobs; without the timeline panel the video takes the full height -->
							<Pane
								size={!isTimelineVisible
									? 100
									: collapsedPercent !== undefined
										? 100 - collapsedPercent
										: layout.left[0]}
								minSize={isTimelineVisible ? 15 : 100}
								class="overflow-auto"
							>
								{@render videoArea()}
							</Pane>

							<!-- Timeline panel -->
							{#if isTimelineVisible}
								<Pane
									size={collapsedPercent ?? layout.left[1]}
									minSize={collapsedPercent ?? 10}
									maxSize={collapsedPercent ?? 100}
									class="overflow-hidden"
								>
									{@render timelineArea()}
								</Pane>
							{/if}
						</Splitpanes>
					</div>
				</Pane>

				<!-- Marker panel -->
				{#if isMarkerVisible}
					<Pane
						size={layout.main[1]}
						minSize={20}
						maxSize={50}
						class="flex flex-col overflow-hidden"
					>
						{@render markerArea()}
					</Pane>
				{/if}
			</Splitpanes>
		{/if}
	</div>
{/if}
