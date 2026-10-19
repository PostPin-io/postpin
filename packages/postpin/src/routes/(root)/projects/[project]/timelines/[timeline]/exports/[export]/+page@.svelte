<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { getExport, getUrl } from "./export.remote";
	import Header from "#lib/components/Header.svelte";
	import MarkerPanel from "#lib/components/review/MarkerPanel.svelte";

	import { Pane, Splitpanes } from "svelte-splitpanes";

	const STORAGE_KEY = "postpin:export-panes";
	const defaults = { main: [75, 25], left: [65, 35] };
	type PaneLayout = typeof defaults;

	function loadLayout(): PaneLayout {
		if (typeof localStorage === "undefined") return defaults;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			const valid = (a: unknown, n: number) =>
				Array.isArray(a) && a.length === n && a.every((v) => typeof v === "number" && v > 0);
			return {
				main: valid(saved?.main, 2) ? saved.main : defaults.main,
				left: valid(saved?.left, 2) ? saved.left : defaults.left,
			};
		} catch {
			return defaults;
		}
	}

	let layout = $state(loadLayout());

	function saveLayout(key: keyof PaneLayout, event: CustomEvent<{ size: number }[]>) {
		layout[key] = event.detail.map((pane) => pane.size);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
	}

	const exportQuery = $derived(
		getExport({
			projectId: page.params.project ?? "",
			timelineId: page.params.timeline ?? "",
			exportId: page.params.export ?? "",
		}),
	);

	onMount(() => {
		const interval = setInterval(() => {
			if (exportQuery.current?.media?.status === "PROCESSING") {
				exportQuery.refresh();
			}
		}, 1000);

		return () => clearInterval(interval);
	});

	// <!-- Toggle Panes -->
	const exp = $derived(await exportQuery);
	const media = $derived(exp.media);

	function toggleMarkerPanel() {
		isMarkerVisible = !isMarkerVisible;
		layout.main = isMarkerVisible ? [65, 35] : [100, 0];
	}

	function toggleTimelinePanel() {
		isTimelineVisible = !isTimelineVisible;
		layout.left = isTimelineVisible ? [65, 35] : [100, 0];
	}
	let isMarkerVisible = $state(true);
	let isTimelineVisible = $state(true);
</script>

<button onclick={toggleMarkerPanel}>
	{isMarkerVisible == true ? "Hide" : "Show"}
</button>

<button onclick={toggleTimelinePanel}>
	{isTimelineVisible == true ? "Hide" : "Show"}
</button>
<div class="flex h-full flex-col overflow-hidden">
	<Header />
	<Splitpanes theme="daisy-theme" class="min-h-0 flex-1" on:resized={(e) => saveLayout("main", e)}>
		<Pane size={layout.main[0]} minSize={25} class="overflow-auto">
			<Splitpanes theme="daisy-theme" horizontal on:resized={(e) => saveLayout("left", e)}>
				<Pane size={layout.left[0]} minSize={15} class="overflow-auto">
					<!-- <span>video preview</span> -->

					<div class="flex h-full flex-col">
						{#if !media}
							<p>Nothing uploaded yet.</p>
						{:else}
							{#each media.jobs as job (job.id)}
								<div class="flex items-center gap-2" title={job.failedReason}>
									<span class="w-32">{job.label}</span>
									<span class="w-20">{job.state}</span>
									{#if job.state === "active" || job.state === "waiting"}
										<progress class="progress w-24" value={job.progress * 100} max="100"></progress>
									{/if}
								</div>
							{/each}

							{#if media.status !== "PENDING"}
								<div class="flex min-h-0 flex-1 items-center justify-center">
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										src={await getUrl({ mediaId: media.id, type: "original" })}
										poster={media.thumbnail
											? await getUrl({ mediaId: media.id, type: "thumbnail" })
											: undefined}
										controls
										class="max-h-full max-w-full"
									></video>
								</div>
							{/if}
						{/if}
					</div>
				</Pane>
				{#if isTimelineVisible}
					<Pane size={layout.left[1]} minSize={10} class="overflow-auto"></Pane>
				{/if}
			</Splitpanes>
		</Pane>
		{#if isMarkerVisible}
			<Pane size={layout.main[1]} minSize={20} class="overflow-auto">
				<!-- <span>Marker Panel</span> -->
				<MarkerPanel />
			</Pane>
		{/if}
	</Splitpanes>
</div>
