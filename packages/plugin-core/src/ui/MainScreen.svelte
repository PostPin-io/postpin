<script lang="ts">
	import {
		createProject,
		createTimeline,
		getConfig,
		getExports,
		type GetExportsResponse,
		type ProjectWithTimelines,
		type Timeline,
	} from "@postpin-io/api-client-ts";
	import { createClient } from "@postpin-io/api-client-ts/client";
	import { API_VERSION_HEADER, POSTPIN_API_VERSION } from "@postpin-io/shared/api-version";
	import { onMount, type Snippet } from "svelte";
	import type {
		Capabilities,
		RenderProgress,
		Settings,
		TimelineInfo,
		UploadProgress,
	} from "../bridge";
	import { errorMessage } from "../errors";
	import { loadProjectsWithTimelines } from "../projects";
	import { renderAndUpload as runRenderAndUpload } from "../renderAndUpload";
	import { prepareCompatibleUpdate } from "../autoUpdate";
	import type { AvailableUpdate } from "../bridge";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import { syncMarkersDown, syncMarkersUp } from "../sync";
	import { getBridges } from "./context";
	import Destination from "./Destination.svelte";
	import FlowArrow from "./FlowArrow.svelte";
	import HostNode from "./HostNode.svelte";
	import ProgressBars from "./ProgressBars.svelte";
	import RenderToDisk from "./RenderToDisk.svelte";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Globe from "@lucide/svelte/icons/globe";
	import LogOut from "@lucide/svelte/icons/log-out";
	import PostPinLogo from "./PostPinLogo.svelte";
	import VersionMismatch from "./VersionMismatch.svelte";

	interface Props {
		header?: Snippet;
		// room for the window buttons of a hidden title bar (Electron), not needed in a host panel
		titleBarInset?: boolean;
		// fetch for the API client, for hosts whose UI can't reach the server directly
		fetch?: typeof globalThis.fetch;
	}

	let { header, titleBarInset = true, fetch }: Props = $props();

	const { nle, host } = getBridges();

	type TimelineExport = GetExportsResponse["exports"][number];
	interface Location {
		project: ProjectWithTimelines;
		timeline: Timeline;
	}

	const client = createClient({
		baseUrl: `${await host.getServerUrl()}/api`,
		auth: async () => (await host.getToken()) ?? undefined,
		// the API answers 426 unless this plugin speaks exactly the server's API version
		headers: { [API_VERSION_HEADER]: String(POSTPIN_API_VERSION) },
		// svelte-ignore state_referenced_locally
		fetch,
	});
	// Token expired or session revoked: log out, App then shows the login screen.
	// Several requests can fail at once, so log out only once.
	let loggingOut = false;
	client.interceptors.response.use(async (response) => {
		if (response.status === 401 && !loggingOut) {
			loggingOut = true;
			await host.logout();
		} else if (response.status === 426 && !versionMismatch) {
			// a clone: the caller still reads the body for its error
			const body = await response.clone().json();
			versionMismatch = {
				pluginApiVersion: body.clientApiVersion ?? POSTPIN_API_VERSION,
				serverApiVersion: body.serverApiVersion,
				serverRelease: body.serverRelease ?? null,
			};
		}
		return response;
	});

	let versionMismatch = $state<{
		pluginApiVersion: number | string;
		serverApiVersion: number;
		serverRelease?: string | null;
	} | null>(null);

	type NleState =
		| { status: "connecting" }
		| { status: "connected"; capabilities: Capabilities; timeline: TimelineInfo | null }
		| { status: "disconnected"; error: string };
	let nleState = $state<NleState>({ status: "connecting" });

	const [loadedProjects, lastSettings] = await Promise.all([
		// a 426 rejects the first request; the interceptor set versionMismatch, which replaces the screen
		loadProjectsWithTimelines(client).catch((error: unknown): ProjectWithTimelines[] => {
			if (versionMismatch) return [];
			throw error;
		}),
		host.getSettings(),
	]);

	let projectsWithTimelines = $state(loadedProjects);

	let nleConnectTimer: ReturnType<typeof setTimeout> | null = null;
	function clearNleConnectTimer() {
		if (nleConnectTimer) {
			clearTimeout(nleConnectTimer);
			nleConnectTimer = null;
		}
	}
	// Connects to the NLE, retrying every few seconds while it isn't reachable.
	// Concurrent calls share one attempt, so there is only ever one retry loop.
	const RETRY_MS = 3000;
	let connecting: Promise<void> | null = null;
	let destroyed = false;
	function scheduleConnect() {
		if (!destroyed) nleConnectTimer = setTimeout(connectNle, RETRY_MS);
	}
	function connectNle() {
		clearNleConnectTimer();
		// Hosts can be unreachable while they work (Reaper blocks while rendering), try again later
		if (isBusy) {
			scheduleConnect();
			return Promise.resolve();
		}
		connecting ??= (async () => {
			let timeline: TimelineInfo | null;
			try {
				const [capabilities, info] = await Promise.all([
					nle.getCapabilities(),
					nle.getTimelineInfo(),
				]);
				timeline = info;
				nleState = { status: "connected", capabilities, timeline };
			} catch (err) {
				nleState = { status: "disconnected", error: errorMessage(err) };
				scheduleConnect();
				return;
			} finally {
				connecting = null;
			}
			// A failing PostPin request isn't an NLE problem, so it doesn't change nleState
			await applyLinked(timeline).catch(() => {});
		})();
		return connecting;
	}

	const capabilities = $derived(nleState.status === "connected" ? nleState.capabilities : null);
	const nleTimeline = $derived(nleState.status === "connected" ? nleState.timeline : null);

	// An update downloaded in the background, ready to install (self-updating hosts only)
	let readyUpdate = $state<AvailableUpdate | null>(null);

	onMount(() => {
		connectNle();
		// Only now the server's API version is known: updating blindly at startup could install a
		// plugin newer than a pinned server. A 426 shows VersionMismatch, which has its own update.
		const { updater } = host;
		if (updater) {
			getConfig({ client, throwOnError: true })
				.then(({ data }) => prepareCompatibleUpdate(updater, data.apiVersion))
				.then((update) => {
					if (!destroyed) readyUpdate = update;
				})
				.catch((error: unknown) =>
					console.warn("[PostPin] update check failed:", errorMessage(error)),
				);
		}
		return () => {
			destroyed = true;
			clearNleConnectTimer();
		};
	});

	// Newest first
	async function loadExports({ project, timeline }: Location) {
		const { data } = await getExports({
			client,
			path: { projectId: project.id, timelineId: timeline.id },
			throwOnError: true,
		});
		return data.exports.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	function findLinked(timeline: TimelineInfo | null): Location | null {
		if (!timeline) return null;
		for (const project of projectsWithTimelines) {
			const linkedTimeline = project.timelines.find(
				(t: Timeline) => t.nleTimelineId === timeline.id,
			);
			if (linkedTimeline) return { project, timeline: linkedTimeline };
		}
		return null;
	}

	let settings = $state<Settings>(lastSettings);
	let showDiskSettings = $state(false);
	// Renders go to a timeline, marker actions work on one export of a timeline.
	// Both start at the linked timeline and its latest export, once the NLE is connected.
	let uploadTarget = $state<Location | null>(null);
	let markerTarget = $state<(Location & { export: TimelineExport | null }) | null>(null);

	// Fills in the targets the user hasn't chosen yet, keeps the ones they have
	async function applyLinked(timeline: TimelineInfo | null) {
		const location = findLinked(timeline);
		if (!location) return;
		uploadTarget ??= location;
		if (!markerTarget) {
			const exports = await refreshExports(location);
			markerTarget ??= { ...location, export: exports[0] ?? null };
		}
	}

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
	// encoding the review versions, 0 to 1
	let transcodeProgress = $state<number | null>(null);
	let error = $state<string | null>(null);

	// Runs a button action, showing its error and blocking the other buttons meanwhile
	async function runLong(action: () => Promise<void>) {
		isBusy = "rendering";
		error = null;
		try {
			await action();
		} catch (err) {
			error = errorMessage(err);
			connectNle();
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
			connectNle();
		} finally {
			isBusy = null;
		}
	}

	// Dock / taskbar progress for the whole run: rendering up to 45 %, uploading the rest. Encoding
	// the review versions runs alongside the upload and has only its own bar.
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
		transcodeProgress = null;
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
					setDockProgress((progress.percent / 100) * 0.45);
				},
				onTranscodeProgress: (fraction) => {
					transcodeProgress = fraction;
				},
				onUploadProgress: (progress) => {
					uploadProgress = progress;
					setDockProgress(0.45 + (progress.uploadedBytes / progress.totalBytes) * 0.55);
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

	const canRender = $derived(nleState.status === "connected" && !!uploadTarget && !isBusy);
	const canSync = $derived(nleState.status === "connected" && !!markerTarget?.export && !isBusy);
</script>

<!-- Label arrows point at PostPin: up when stacked, right when PostPin is on the right -->
{#snippet toPostPin()}<span class="@3xl:hidden">↑</span><span class="hidden @3xl:inline">→</span
	>{/snippet}
{#snippet fromPostPin()}<span class="@3xl:hidden">↓</span><span class="hidden @3xl:inline">←</span
	>{/snippet}

{#if versionMismatch}
	<VersionMismatch {...versionMismatch} />
{:else}
	<!-- Fills the window: the header stays put, only the content below it scrolls -->
	<main class="@container flex h-screen flex-col">
		<header
			class={[
				"flex shrink-0 items-center border-t border-base-content/20 px-4 py-2 text-sm select-none [app-region:drag]",
				titleBarInset && "ms-16",
			]}
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
			{#if readyUpdate}
				<!-- installs on quit anyway; restarting now would cut off a running render or upload -->
				<button
					type="button"
					class="btn btn-ghost btn-sm text-primary [app-region:no-drag]"
					title="Restart PostPin to install the update"
					disabled={!!isBusy}
					onclick={() => host.updater?.install()}
				>
					<RefreshCw size={14} /> Update {readyUpdate.version}
				</button>
			{/if}
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
			<!-- Stacked: PostPin on top, the actions, the program at the bottom, joined by vertical arrows.
		     @md: PostPin's two parts side by side, each action right below its part.
		     @3xl: the program left, the actions in the middle, PostPin right, joined by horizontal arrows.
		     PostPin's parts line up with the actions through subgrid. Below @3xl the rows have no gap,
		     so the arrows reach the boxes. -->
			<div
				class="grid grid-cols-1 p-4 @md:grid-cols-2 @md:gap-x-4 @3xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] @3xl:gap-x-0 @3xl:gap-y-4"
			>
				<section
					class="grid min-w-0 rounded-box border-2 border-base-content/50 @md:col-span-2 @md:grid-cols-subgrid @md:gap-x-0 @3xl:col-span-1 @3xl:col-start-3 @3xl:row-span-2 @3xl:row-start-1 @3xl:grid-cols-1 @3xl:grid-rows-subgrid @3xl:gap-y-0"
				>
					<div class="min-w-0 p-4">
						<Destination
							framed={false}
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

					<div
						class="min-w-0 border-t border-base-content/30 p-4 @md:border-t-0 @md:border-l @3xl:border-t @3xl:border-l-0"
					>
						<Destination
							framed={false}
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
				</section>

				{#if isBusy == "rendering"}
					<div
						class="flex flex-col justify-center gap-3 py-4 @md:col-span-2 @md:col-start-1 @md:row-start-2 @3xl:col-span-1 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1 @3xl:px-4 @3xl:py-0"
					>
						<ProgressBars {renderProgress} {transcodeProgress} {uploadProgress} />
						{#if log.length}
							<p class="text-center text-sm text-base-content/60">{log.at(-1)}</p>
						{/if}
					</div>
				{:else}
					<div
						class="flex min-w-0 flex-col @md:col-start-1 @md:row-start-2 @3xl:col-start-2 @3xl:row-start-1 @3xl:flex-row @3xl:items-center"
					>
						<FlowArrow direction="right" disabled={!canRender}>
							<div class="join max-w-full">
								<button
									type="button"
									class="btn join-item h-auto min-w-0 flex-col gap-0 py-2 whitespace-normal btn-primary"
									disabled={!canRender}
									onclick={renderAndUpload}
								>
									Render & Upload {@render toPostPin()}
									<span class="text-xs font-normal break-words opacity-75">
										{uploadTarget
											? `new export in ${uploadTarget.timeline.name}`
											: "choose a location first"}
									</span>
								</button>
								{#if capabilities?.renderToDisk}
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

					<div
						class="flex min-w-0 flex-col @md:col-start-2 @md:row-start-2 @3xl:col-start-2 @3xl:row-start-2 @3xl:flex-row @3xl:items-center"
					>
						<FlowArrow direction="both" disabled={!canSync}>
							<div
								class="flex w-48 max-w-full flex-col gap-2 rounded-box border-2 border-base-content/50 p-3"
							>
								<!-- the export's name is in the PostPin box already -->
								<h3 class="text-center text-xs tracking-widest text-base-content/60 uppercase">
									Markers
								</h3>
								<button type="button" class="btn" disabled={!canSync} onclick={syncUp}>
									{#if isBusy == "syncingMarkersUp"}
										<span class="loading loading-spinner loading-sm ms-2"></span>
									{:else}
										Push markers {@render toPostPin()}
									{/if}
								</button>
								<button type="button" class="btn" disabled={!canSync} onclick={syncDown}>
									{#if isBusy == "syncingMarkersDown"}
										<span class="loading loading-spinner loading-sm ms-2"></span>
									{:else}
										{@render fromPostPin()} Pull comments
									{/if}
								</button>
							</div>
						</FlowArrow>
					</div>
				{/if}

				<div
					class="@md:col-span-2 @md:row-start-3 @3xl:col-span-1 @3xl:col-start-1 @3xl:row-span-2 @3xl:row-start-1 @3xl:grid"
				>
					<HostNode
						hostName={capabilities?.hostName ?? null}
						status={nleState.status}
						error={nleState.status === "disconnected" ? nleState.error : null}
						onRetry={connectNle}
						thumbnailDataUrl={nleTimeline?.thumbnailDataUrl}
						timelineName={nleTimeline?.name ?? null}
						projectName={nleTimeline?.projectName ?? null}
						disabled={isBusy !== null || nleState.status !== "connected"}
						onClearMarkers={deleteMarkers}
						{header}
					/>
				</div>
			</div>

			{#if showDiskSettings && capabilities?.renderToDisk && !isBusy}
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
{/if}
