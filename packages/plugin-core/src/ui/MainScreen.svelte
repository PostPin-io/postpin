<script lang="ts">
	import {
		createProject,
		createTimeline,
		getExports,
		type GetExportsResponse,
		type ProjectWithTimelines,
		type Timeline,
	} from "@postpin-io/api-client-ts";
	import { createClient } from "@postpin-io/api-client-ts/client";
	import type { Snippet } from "svelte";
	import type { RenderProgress, Settings, UploadProgress } from "../bridge";
	import { errorMessage } from "../errors";
	import { loadProjectsWithTimelines } from "../projects";
	import { renderAndUpload as runRenderAndUpload } from "../renderAndUpload";
	import { syncMarkersDown, syncMarkersUp } from "../sync";
	import { getBridges } from "./context";
	import Destination from "./Destination.svelte";
	import FlowArrow from "./FlowArrow.svelte";
	import HostNode from "./HostNode.svelte";
	import ProgressBars from "./ProgressBars.svelte";
	import RenderToDisk from "./RenderToDisk.svelte";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Globe from "@lucide/svelte/icons/globe";
	import Link from "@lucide/svelte/icons/link";
	import LogOut from "@lucide/svelte/icons/log-out";
	import PostPinLogo from "./PostPinLogo.svelte";

	interface Props {
		header?: Snippet;
	}

	let { header }: Props = $props();

	const { nle, host } = getBridges();

	type TimelineExport = GetExportsResponse["exports"][number];
	interface Location {
		project: ProjectWithTimelines;
		timeline: Timeline;
	}

	const client = createClient({
		baseUrl: `${await host.getServerUrl()}/api`,
		auth: async () => (await host.getToken()) ?? undefined,
	});
	// Token expired or session revoked: log out, App then shows the login screen.
	// Several requests can fail at once, so log out only once.
	let loggingOut = false;
	client.interceptors.response.use(async (response) => {
		if (response.status === 401 && !loggingOut) {
			loggingOut = true;
			await host.logout();
		}
		return response;
	});
	const [capabilities, loadedProjects, lastSettings, nleTimeline] = await Promise.all([
		nle.getCapabilities(),
		loadProjectsWithTimelines(client),
		host.getSettings(),
		nle.getTimelineInfo(),
	]);

	let projectsWithTimelines = $state(loadedProjects);

	// The PostPin timeline linked to the timeline open in the NLE
	function findLinked(): Location | null {
		if (!nleTimeline) return null;
		for (const project of projectsWithTimelines) {
			const timeline = project.timelines.find((t: Timeline) => t.nleTimelineId === nleTimeline.id);
			if (timeline) return { project, timeline };
		}
		return null;
	}

	// Newest first
	async function loadExports({ project, timeline }: Location) {
		const { data } = await getExports({
			client,
			path: { projectId: project.id, timelineId: timeline.id },
			throwOnError: true,
		});
		return data.exports.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	const linked = findLinked();

	let settings = $state<Settings>(lastSettings);
	let showDiskSettings = $state(false);
	// Renders go to a timeline, marker actions work on one export of a timeline.
	// Both start at the linked timeline and its latest export.
	let uploadTarget = $state<Location | null>(linked);
	let markerTarget = $state<(Location & { export: TimelineExport | null }) | null>(
		linked ? { ...linked, export: (await loadExports(linked))[0] ?? null } : null,
	);

	// Exports of every timeline for the export picker, newest first. Loads in the background so the
	// screen doesn't wait for one request per timeline.
	let exportsByTimeline = $state<Record<string, TimelineExport[]>>({});
	async function refreshExports(location: Location) {
		const exports = await loadExports(location);
		exportsByTimeline[location.timeline.id] = exports;
		return exports;
	}
	function refreshAllExports() {
		return Promise.all(
			projectsWithTimelines.flatMap((project) =>
				project.timelines.map((timeline) => refreshExports({ project, timeline }).catch(() => [])),
			),
		);
	}
	refreshAllExports();

	// Called when a picker opens, so it lists projects and timelines created elsewhere. The modal
	// opens right away and the lists update once the data arrives.
	let refreshing: Promise<unknown> | null = null;
	function refreshProjects() {
		refreshing ??= loadProjectsWithTimelines(client)
			.then((projects) => {
				projectsWithTimelines = projects;
				return refreshAllExports();
			})
			.catch(() => {})
			.finally(() => (refreshing = null));
		return refreshing;
	}
	const projectsWithExports = $derived(
		projectsWithTimelines.map((project) => ({
			...project,
			timelines: project.timelines.map((timeline) => ({
				...timeline,
				exports: exportsByTimeline[timeline.id] ?? [],
			})),
		})),
	);

	function findLocation(projectId: string, timelineId: string): Location | null {
		const project = projectsWithTimelines.find((p) => p.id === projectId);
		const timeline = project?.timelines.find((t: Timeline) => t.id === timelineId);
		return project && timeline ? { project, timeline } : null;
	}

	async function createNewProject(name: string, organizationId?: string) {
		const { data } = await createProject({
			client,
			body: { name, organizationId },
			throwOnError: true,
		});
		projectsWithTimelines.unshift({ ...data, timelines: [] });
		return data.id;
	}

	async function createNewTimeline(projectId: string, name: string) {
		const { data } = await createTimeline({
			client,
			path: { projectId },
			body: { name },
			throwOnError: true,
		});
		projectsWithTimelines.find((p) => p.id === projectId)?.timelines.unshift(data);
		exportsByTimeline[data.id] = [];
		return data.id;
	}

	function selectUploadTarget(projectId: string, timelineId: string) {
		uploadTarget = findLocation(projectId, timelineId) ?? uploadTarget;
	}

	async function selectMarkerTarget(projectId: string, timelineId: string, exportId?: string) {
		const location = findLocation(projectId, timelineId);
		if (!location) return;
		const exports = exportsByTimeline[timelineId] ?? (await refreshExports(location));
		markerTarget = { ...location, export: exports.find((e) => e.id === exportId) ?? null };
	}

	let log: string[] = $state([]);
	let isBusy: "syncingMarkersUp" | "syncingMarkersDown" | "deletingMarkers" | "rendering" | null =
		$state(null);
	let renderProgress = $state<RenderProgress | null>(null);
	let uploadProgress = $state<UploadProgress | null>(null);
	let error = $state<string | null>(null);

	// Runs a button action, showing its error and blocking the other buttons meanwhile
	async function runLong(action: () => Promise<void>) {
		isBusy = "rendering";
		error = null;
		try {
			await action();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			isBusy = null;
		}
	}
	async function runShort(type: typeof isBusy, action: () => Promise<void>) {
		isBusy = type;
		error = null;
		log = [];
		await new Promise((resolve) => setTimeout(resolve, 1000));
		try {
			await action();
			log = ["Done"];
		} catch (err) {
			error = errorMessage(err);
		} finally {
			isBusy = null;
		}
	}

	// Dock / taskbar progress for the whole run: rendering fills the first half, uploading the second.
	// Only sends whole-percent changes, progress events can come in much faster.
	let lastDockPercent: number | null = null;
	function setDockProgress(fraction: number | null) {
		const percent = fraction === null ? null : Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
		if (percent === lastDockPercent) return;
		lastDockPercent = percent;
		host.setProgress(percent === null ? null : percent / 100);
	}

	function renderAndUpload() {
		if (!uploadTarget) return;
		const target = uploadTarget;
		const ids = { projectId: target.project.id, timelineId: target.timeline.id };

		renderProgress = null;
		uploadProgress = null;
		log = [];
		return runLong(async () => {
			await host.saveSettings($state.snapshot(settings));

			const { exportId } = await runRenderAndUpload({
				nle,
				host,
				client,
				...ids,
				onStep: (message) => log.push(message),
				onRenderProgress: (progress) => {
					renderProgress = progress;
					setDockProgress((progress.percent / 100) * 0.5);
				},
				onUploadProgress: (progress) => {
					uploadProgress = progress;
					setDockProgress(0.5 + (progress.uploadedBytes / progress.totalBytes) * 0.5);
				},
			}).finally(() => setDockProgress(null));

			// Marker actions continue on the new export
			const exports = await refreshExports(target);
			markerTarget = { ...target, export: exports.find((e) => e.id === exportId) ?? null };

			log.push("Processing started, opening export in browser...");
			await host.openInBrowser(
				`/projects/${ids.projectId}/timelines/${ids.timelineId}/exports/${exportId}`,
			);
			log.push(`Done`);
		});
	}

	function syncContext() {
		if (!markerTarget?.export) return null;
		return {
			nle,
			client,
			projectId: markerTarget.project.id,
			timelineId: markerTarget.timeline.id,
			exportId: markerTarget.export.id,
		};
	}

	function syncUp() {
		const context = syncContext();
		if (context) return runShort("syncingMarkersUp", () => syncMarkersUp(context));
	}

	function syncDown() {
		const context = syncContext();
		if (context) return runShort("syncingMarkersDown", () => syncMarkersDown(context));
	}

	function deleteMarkers() {
		return runShort("deletingMarkers", () => nle.clearMarkers());
	}

	const canRender = $derived(!!uploadTarget && !isBusy);
	const canSync = $derived(!!markerTarget?.export && !isBusy);
</script>

<!-- Fills the window: the header stays put, only the content below it scrolls -->
<main class="@container flex h-screen flex-col">
	<header
		class="flex shrink-0 items-center border-t border-base-content/20 px-4 py-2 text-sm select-none [app-region:drag] ms-16"
	>
		<button
			type="button"
			class="cursor-pointer
			 items-center flex [app-region:no-drag] text-white"
			onclick={() => host.openInBrowser("/")}
		>
			<PostPinLogo class="h-5 w-auto me-3" />
			<span class="text-base-content/60 text-xl no-underline"> PostPin </span>
		</button>

		<span class="flex-1"></span>
		<!-- Buttons in a drag region need no-drag, otherwise the window swallows their clicks -->
		<button
			type="button"
			class="btn btn-link btn-sm [app-region:no-drag]"
			onclick={() => host.openInBrowser("/")}
		>
			<Globe size={14} />
		</button>
		<button
			type="button"
			class="btn btn-link btn-sm [app-region:no-drag]"
			onclick={() => host.logout()}
		>
			<LogOut size={14} />
		</button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="grid grid-cols-1 gap-4 p-4 @2xl:grid-cols-[1fr_1.15fr_1fr] @2xl:gap-x-0">
			<div class="@2xl:col-start-1 @2xl:row-span-2 @2xl:row-start-1 @2xl:grid">
				<HostNode
					hostName={capabilities.hostName}
					thumbnailDataUrl={nleTimeline?.thumbnailDataUrl}
					timelineName={nleTimeline?.name ?? null}
					projectName={nleTimeline?.projectName ?? null}
					disabled={isBusy !== null}
					onClearMarkers={deleteMarkers}
					{header}
				/>
			</div>

			{#if isBusy == "rendering"}
				<div
					class="flex flex-col justify-center gap-3 @2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-1 @2xl:px-4"
				>
					<ProgressBars {renderProgress} {uploadProgress} />
					{#if log.length}
						<p class="text-center text-sm text-base-content/60">{log.at(-1)}</p>
					{/if}
				</div>
			{:else}
				<div class="flex items-center @2xl:col-start-2 @2xl:row-start-1">
					<FlowArrow direction="right" disabled={!canRender}>
						<div class="join">
							<button
								type="button"
								class="btn join-item h-auto flex-col gap-0 py-2 btn-primary"
								disabled={!canRender}
								onclick={renderAndUpload}
							>
								Render & Upload →
								<span class="text-xs font-normal opacity-75">
									{uploadTarget
										? `new export in ${uploadTarget.timeline.name}`
										: "choose a location first"}
								</span>
							</button>
							{#if capabilities.renderToDisk}
								<button
									type="button"
									class={[
										"btn join-item h-auto btn-primary border-left-2 border-base-content/20 border-0 flex-col gap-0 py-2",
										showDiskSettings && "btn-active",
									]}
									aria-label="Render to disk settings"
									onclick={() => (showDiskSettings = !showDiskSettings)}
								>
									<SettingsIcon />
								</button>
							{/if}
						</div>
					</FlowArrow>
				</div>
			{/if}

			<div class="@2xl:col-start-3 @2xl:row-start-1 @2xl:grid">
				<Destination
					title="Upload to"
					path={uploadTarget?.project.name}
					name={uploadTarget?.timeline.name}
					mode="timeline"
					projects={projectsWithTimelines}
					selectedProjectId={uploadTarget?.project.id}
					selectedTimelineId={uploadTarget?.timeline.id}
					onSelect={selectUploadTarget}
					onBeforeChoose={refreshProjects}
					onCreateProject={createNewProject}
					onCreateTimeline={createNewTimeline}
					emptyText="This timeline isn't linked to a PostPin timeline yet."
					highlightChoose={!uploadTarget}
					browserUrl={uploadTarget
						? `/projects/${uploadTarget.project.id}/timelines/${uploadTarget.timeline.id}/exports`
						: undefined}
				></Destination>
			</div>

			{#if isBusy !== "rendering"}
				<div class="flex items-center @2xl:col-start-2 @2xl:row-start-2">
					<FlowArrow direction="both" disabled={!canSync}>
						<div
							class="flex min-w-48 flex-col gap-2 rounded-box border-2 border-base-content/50 p-3"
						>
							<h3
								class="truncate text-center text-xs tracking-widest text-base-content/60 uppercase"
							>
								Markers{markerTarget?.export ? ` · ${markerTarget.export.name}` : ""}
							</h3>
							<button type="button" class="btn" disabled={!canSync} onclick={syncUp}>
								{#if isBusy == "syncingMarkersUp"}
									<span class="loading loading-spinner loading-sm ms-2"></span>
								{:else}
									Push markers →
								{/if}
							</button>
							<button type="button" class="btn" disabled={!canSync} onclick={syncDown}>
								{#if isBusy == "syncingMarkersDown"}
									<span class="loading loading-spinner loading-sm ms-2"></span>
								{:else}
									← Pull comments
								{/if}
							</button>
						</div>
					</FlowArrow>
				</div>
			{/if}

			<div class="@2xl:col-start-3 @2xl:row-start-2 @2xl:grid">
				<Destination
					title="Markers with"
					path={markerTarget
						? `${markerTarget.project.name} › ${markerTarget.timeline.name}`
						: undefined}
					name={markerTarget?.export?.name}
					mode="export"
					projects={projectsWithExports}
					selectedProjectId={markerTarget?.project.id}
					selectedTimelineId={markerTarget?.timeline.id}
					selectedExportId={markerTarget?.export?.id}
					onSelect={selectMarkerTarget}
					onBeforeChoose={refreshProjects}
					onCreateProject={createNewProject}
					onCreateTimeline={createNewTimeline}
					browserUrl={markerTarget?.export
						? `/projects/${markerTarget.project.id}/timelines/${markerTarget.timeline.id}/exports/${markerTarget.export.id}`
						: undefined}
					emptyText={markerTarget
						? "No exports in this timeline yet. Render one first."
						: "No export selected."}
				>
					{#if markerTarget?.export}
						<span class="text-sm text-base-content/60">
							{new Date(markerTarget.export.createdAt).toLocaleString()}
						</span>
					{/if}
				</Destination>
			</div>
		</div>

		{#if showDiskSettings && capabilities.renderToDisk && !isBusy}
			<div
				class="mx-4 mb-4 flex flex-col gap-2 rounded-box border-2 border-dashed border-base-content/30 p-4"
			>
				<RenderToDisk {capabilities} bind:settings />
			</div>
		{/if}

		{#if !isBusy && log.length}
			<div class="mx-4 mb-4 rounded-box border-2 border-base-content/50 p-3 text-sm">
				{log.at(-1)}
			</div>
		{/if}

		{#if error}
			<div role="alert" class="mx-4 mb-4 alert alert-error">
				<span>{error}</span>
			</div>
		{/if}
	</div>
</main>
