<script lang="ts">
	import { onMount, tick } from "svelte";
	import { page } from "$app/state";
	import { getExport, getUrl } from "./export.remote";

	import Header from "#lib/components/Header.svelte";
	import MarkerPanel from "#lib/components/review/MarkerPanel.svelte";
	import { Pane, Splitpanes } from "svelte-splitpanes";
	import Timeline from "./Timeline.svelte";
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { frameAtSeconds, secondsAtFrame } from "./timecode";
	import { getMarkers } from "#lib/components/review/MarkerPanel.remote.ts";

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

	const exp = $derived(await exportQuery);
	const media = $derived(exp?.media);

	let isMounted = $state(false);
	let isLayoutReady = $state(false);

	let isLoading = $derived(!exp || !isMounted || !isLayoutReady);

	let originalUrl = $state<string | undefined>(undefined);
	let thumbnailUrl = $state<string | undefined>(undefined);

	$effect(() => {
		const currentMedia = media;

		if (!currentMedia || currentMedia.status === "PENDING") {
			originalUrl = undefined;
			thumbnailUrl = undefined;
			return;
		}

		let cancelled = false;

		async function loadUrls() {
			try {
				const original = await getUrl({
					mediaId: currentMedia!.id,
					type: "original",
				});

				const thumbnail = currentMedia!.thumbnail
					? await getUrl({
							mediaId: currentMedia!.id,
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
				const current = exportQuery.current;

				if (current?.media?.status === "PROCESSING") {
					await exportQuery.refresh();
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

	const snapshot = $derived(exportQuery.current?.timelineSnapshot as TimelineSnapshot | undefined);
	// Absolute timeline frame, like marker frames
	const currentFrame = $derived(snapshot ? frameAtSeconds(videoPosition, snapshot) : 0);
	const seekToFrame = (frame: number) => {
		if (snapshot) videoPosition = secondsAtFrame(frame, snapshot);
	};
</script>

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
		<Header />

		<Splitpanes
			theme="daisy-theme"
			class="min-h-0 flex-1"
			on:resized={(event) => saveLayout("main", event)}
		>
			<!-- Main content -->
			<Pane size={layout.main[0]} minSize={isMarkerVisible ? 25 : 100} class="overflow-auto">
				<Splitpanes
					theme="daisy-theme"
					horizontal
					on:resized={(event) => saveLayout("left", event)}
				>
					<!-- Video and jobs -->
					<Pane size={layout.left[0]} minSize={isTimelineVisible ? 15 : 100} class="overflow-auto">
						<div class="flex h-full min-h-0 flex-col">
							{#if !media}
								<p>Nothing uploaded yet.</p>
							{:else}
								<!-- Processing jobs -->
								<div class="shrink-0">
									{#each media.jobs as job (job.id)}
										<div class="flex items-center gap-2" title={job.failedReason}>
											<span class="w-32">{job.label}</span>

											<span class="w-20">{job.state}</span>

											{#if job.state === "active" || job.state === "waiting"}
												<progress class="progress w-24" value={job.progress * 100} max="100"
												></progress>
											{/if}
										</div>
									{/each}
								</div>

								<!-- Video -->
								{#if media.status !== "PENDING" && originalUrl}
									<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
										<!-- svelte-ignore a11y_media_has_caption -->
										<video
											bind:currentTime={videoPosition}
											bind:paused={videoPaused}
											bind:playbackRate={videoPlaybackRate}
											src={originalUrl}
											poster={thumbnailUrl}
											controls
											class="max-h-full max-w-full"
										></video>
									</div>
								{/if}
							{/if}
						</div>
					</Pane>

					<!-- Timeline panel -->
					{#if isTimelineVisible}
						<Pane size={layout.left[1]} minSize={10} class="overflow-hidden">
							{#if exportQuery.current?.timelineSnapshot}
								<Timeline
									snapshot={exportQuery.current!.timelineSnapshot as TimelineSnapshot}
									markers={await getMarkers(page.params.export ?? "")}
									bind:videoPositionSeconds={videoPosition}
									bind:paused={videoPaused}
									bind:playbackRate={videoPlaybackRate}
								/>
							{/if}

							<!-- Timeline content -->
						</Pane>
					{/if}
				</Splitpanes>
			</Pane>

			<!-- Marker panel -->
			{#if isMarkerVisible}
				<Pane size={layout.main[1]} minSize={20} maxSize={50} class="overflow-auto">
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
