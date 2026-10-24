<script lang="ts">
	import { createClient } from "@postpin-io/api-client-ts/client";
	import type { Snippet } from "svelte";
	import type { RenderProgress, Settings, UploadProgress } from "../bridge";
	import { errorMessage } from "../errors";
	import { loadProjectsWithTimelines } from "../projects";
	import { renderAndUpload as runRenderAndUpload } from "../renderAndUpload";
	import { syncMarkersDown, syncMarkersUp } from "../sync";
	import { getBridges } from "./context";
	import ExportPicker from "./ExportPicker.svelte";
	import MarkerActions from "./MarkerActions.svelte";
	import ProgressBars from "./ProgressBars.svelte";
	import RenderToDisk from "./RenderToDisk.svelte";
	import TimelinePicker from "./TimelinePicker.svelte";

	interface Props {
		header?: Snippet;
	}

	let { header }: Props = $props();

	const { nle, host } = getBridges();

	const client = createClient({ baseUrl: `${await host.getServerUrl()}/api` });
	const [capabilities, projectsWithTimelines, lastSettings, nleProjectId, nleTimelineId] =
		await Promise.all([
			nle.getCapabilities(),
			loadProjectsWithTimelines(client),
			host.getSettings(),
			nle.getProjectId(),
			nle.getTimelineId(),
		]);

	let settings = $state<Settings>(lastSettings);
	let timelineId = $state<string | null>(null);
	let exportId = $state<string | null>(null);
	// The select only yields a timeline id, so look up the project that owns it.
	const projectId = $derived(
		projectsWithTimelines.find((project) => project.timelines.some((t) => t.id === timelineId))
			?.id ?? null,
	);

	let log: string[] = $state([]);
	let isBusy = $state(false);
	let renderProgress = $state<RenderProgress | null>(null);
	let uploadProgress = $state<UploadProgress | null>(null);
	let error = $state<string | null>(null);

	// Runs a button action, showing its error and blocking the other buttons meanwhile
	async function run(action: () => Promise<void>) {
		isBusy = true;
		error = null;
		try {
			await action();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			isBusy = false;
		}
	}

	function renderAndUpload() {
		if (!projectId || !timelineId) return;
		const ids = { projectId, timelineId };

		renderProgress = null;
		uploadProgress = null;
		log = [];
		return run(async () => {
			await host.saveSettings($state.snapshot(settings));

			const { exportId } = await runRenderAndUpload({
				nle,
				host,
				client,
				...ids,
				onStep: (message) => log.push(message),
				onRenderProgress: (progress) => (renderProgress = progress),
				onUploadProgress: (progress) => (uploadProgress = progress),
			});

			log.push("Processing started, opening export in browser...");
			await host.openInBrowser(
				`/projects/${ids.projectId}/timelines/${ids.timelineId}/exports/${exportId}`,
			);
			log.push(`Done ✅ `);
		});
	}

	function syncContext() {
		if (!projectId || !timelineId || !exportId) return null;
		return { nle, client, projectId, timelineId, exportId };
	}

	function syncUp() {
		const context = syncContext();
		if (context) return run(() => syncMarkersUp(context));
	}

	function syncDown() {
		const context = syncContext();
		if (context) return run(() => syncMarkersDown(context));
	}

	function deleteMarkers() {
		return run(() => nle.clearMarkers());
	}
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="text-2xl font-bold">PostPin Integration</h1>

	{@render header?.()}

	<TimelinePicker projects={projectsWithTimelines} {nleProjectId} {nleTimelineId} bind:timelineId />

	{#if projectId && timelineId}
		<ExportPicker {client} {projectId} {timelineId} bind:exportId />
	{/if}

	{#if capabilities.renderToDisk}
		<RenderToDisk {capabilities} bind:settings />
	{/if}

	<button
		onclick={renderAndUpload}
		disabled={timelineId === null || isBusy}
		class="btn btn-primary"
	>
		Render & Upload
	</button>

	{#if timelineId && exportId}
		<MarkerActions
			disabled={isBusy}
			onSyncUp={syncUp}
			onSyncDown={syncDown}
			onDelete={deleteMarkers}
		/>
	{/if}

	{#if isBusy}
		<ProgressBars {renderProgress} {uploadProgress} />
	{/if}

	<pre>{log.join("\n")}</pre>

	{#if error}
		<div role="alert" class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<button class="btn btn-link" onclick={() => host.logout()}>Logout</button>
</main>
