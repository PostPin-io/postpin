<script lang="ts">
	import {
		getProjects,
		getProject,
		createExport,
		initUpload,
		completeUpload,
		abortUpload,
		getMarkers,
		getExports,
		uploadMarkers,
		type TimelineSnapshot,
		getCategories,
		createCategory,
	} from "@postpin-io/api-client-ts";
	import { createClient } from "@postpin-io/api-client-ts/client";
	import {
		MainAPI,
		MarkerColor,
		type RenderProgress,
		type UploadProgress,
	} from "../ipc/renderer/PostPinResolveAPI";

	const client = createClient({ baseUrl: "http://localhost:5173/api" });

	let renderPreset = $state("");
	let renderSecond = $state(false);
	let renderSecondPath = $state("");
	let renderSecondName = $state("Output.mp4");

	renderPreset = (await MainAPI!.getRenderPresets!())[0] ?? "";

	const { data: projects = [] } = await getProjects({ client });
	const projectsWithTimelines = (
		await Promise.all(
			projects.map(
				async (project) => (await getProject({ client, path: { projectId: project.id } })).data,
			),
		)
	).filter((project) => project !== undefined);

	const lastSettings = await MainAPI!.getLastSettings!();
	if (lastSettings) {
		renderSecond = lastSettings.renderToDisk;
		renderSecondPath = lastSettings.outputPath;
		renderSecondName = lastSettings.filename;
	}

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

	// The returned unsubscribe function doubles as the effect's teardown
	$effect(() =>
		MainAPI!.onRenderProgress!((progress) => {
			console.log("Render progress:", progress);
			renderProgress = progress;
		}),
	);
	$effect(() =>
		MainAPI!.onUploadProgress!((progress) => {
			uploadProgress = progress;
		}),
	);

	const nleProjectId = await MainAPI!.getProjectId!();
	const nleTimelineId = await MainAPI!.getTimelineId!();

	// Electron wraps errors thrown in the main process: "Error invoking remote method 'x': Error: msg".
	// API calls with throwOnError throw the response body, which carries a message.
	function errorMessage(err: unknown) {
		const message =
			err instanceof Error
				? err.message
				: typeof err === "object" && err && "message" in err
					? String(err.message)
					: String(err);
		return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
	}

	function formatMegabytes(bytes: number) {
		return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
	}

	function formatDuration(ms: number) {
		const seconds = Math.round(ms / 1000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
	}

	async function renderAndUpload() {
		if (!projectId || !timelineId) return;

		isBusy = true;
		error = null;
		renderProgress = null;
		uploadProgress = null;
		log = [];
		// Set once the multipart upload exists, so a failure can discard its parts
		let pendingUpload: { exportId: string; uploadId: string } | null = null;
		try {
			await MainAPI!.saveSettings!({
				renderToDisk: renderSecond,
				outputPath: renderSecondPath,
				filename: renderSecondName,
			});

			log.push("Rendering preview...");
			const renderedPath = await MainAPI!.renderPreview!("/tmp", `postpin-preview-${Date.now()}`);
			const timelineSnapshot = (await MainAPI!.buildTimelineSnapshot!()) as TimelineSnapshot;
			log.push("Render complete. Creating export...");
			const exportResponse = await createExport({
				client,
				path: {
					projectId: projectId,
					timelineId: timelineId,
				},
				body: {
					nleProjectId,
					nleTimelineId,
				},
				throwOnError: true,
			});
			const exportId = exportResponse.data.id;
			log.push(`Export created with ID: ${exportId}. Initializing upload...`);
			const fileSize = await MainAPI!.getFileSize!(renderedPath);
			const { data: upload } = await initUpload({
				client,
				path: { projectId, timelineId, exportId },
				body: { fileSize },
				throwOnError: true,
			});
			pendingUpload = { exportId, uploadId: upload.uploadId };
			log.push(`Uploading ${formatMegabytes(fileSize)} in ${upload.parts.length} parts...`);
			const parts = await MainAPI!.uploadRenderedFile!(renderedPath, upload.partSize, upload.parts);
			log.push("Upload complete. Starting processing...");
			await completeUpload({
				client,
				path: { projectId, timelineId, exportId },
				body: { uploadId: upload.uploadId, parts, timelineSnapshot },
				throwOnError: true,
			});
			pendingUpload = null;
			log.push("Processing started, opening export in browser...");
			await MainAPI!.openInBrowser!(
				`/projects/${projectId}/timelines/${timelineId}/exports/${exportId}`,
			);
			log.push(`Done ✅ `);
		} catch (err) {
			error = errorMessage(err);
			if (pendingUpload) {
				const { exportId, uploadId } = pendingUpload;
				await abortUpload({
					client,
					path: { projectId, timelineId, exportId },
					body: { uploadId },
				}).catch(() => {});
			}
		} finally {
			isBusy = false;
		}
	}

	interface CustomData {
		__postpin?: boolean;
		id?: string;
	}

	const resolveColors: Record<MarkerColor, string> = {
		Blue: "#3B82F6",
		Cocoa: "#A0522D",
		Cream: "#FFFDD0",
		Cyan: "#00FFFF",
		Green: "#00FF00",
		Fuchsia: "#FF00FF",
		Lavender: "#E6E6FA",
		Lemon: "#FFF700",
		Mint: "#98FF98",
		Pink: "#FFC0CB",
		Purple: "#800080",
		Red: "#FF0000",
		Rose: "#FF007F",
		Sand: "#C2B280",
		Sky: "#87CEEB",
		Yellow: "#FFFF00",
	};

	async function syncMarkersUp() {
		if (!projectId || !timelineId || !exportId) return;
		const markers = await MainAPI!.getMarkers!();

		const timelineStartFrame = await MainAPI!.getTimelineStartFrame!();
		console.log("Timeline start frame:", timelineStartFrame);
		const categories = await getCategories({ client, path: { projectId } });

		let mappedMarkers: {
			name: string;
			description: string;
			frame: number;
			categoryId: string;
			id?: string;
		}[] = [];

		for (const m of markers) {
			let customData: CustomData = {};
			try {
				customData = JSON.parse(m.customData || "{}");
			} catch (e) {
				console.error("Error parsing custom data:", e);
			}
			const firstLine = m.description.split("\n")[0];
			let categoryId: string | undefined = undefined;
			if (firstLine.startsWith("#") && firstLine.length > 1) {
				const categoryName = firstLine.substring(1).trim();
				const category = categories.data?.find((c) => c.name === categoryName);
				if (category) {
					categoryId = category.id;
				}
			}
			if (!categoryId) {
				const newCategoryName = `Resolve ${m.color}`;
				if (categories.data?.some((c) => c.name === newCategoryName)) {
					categoryId = categories.data.find((c) => c.name === newCategoryName)!.id;
				} else {
					const newCategory = await createCategory({
						client,
						body: { name: newCategoryName, color: resolveColors[m.color] },
						path: { projectId },
					});
					categoryId = newCategory.data!.id;
				}
			}
			mappedMarkers.push({
				name: m.title,
				description: m.description,
				frame: m.frame + timelineStartFrame,
				categoryId: categoryId,
				id: customData.__postpin ? customData.id : undefined,
			});
		}

		console.log("Mapped markers for upload:", mappedMarkers);

		await uploadMarkers({
			client,
			body: mappedMarkers,
			path: {
				projectId,
				timelineId,
				exportId,
			},
		});
	}

	async function syncMarkersDown() {
		if (!projectId || !timelineId || !exportId) return;
		const { data: markers } = await getMarkers({
			client,
			path: { projectId, timelineId, exportId },
		});
		const timelineStartFrame = await MainAPI!.getTimelineStartFrame!();
		const mappedMarkers = markers!.map((m) => ({
			title: m.name,
			description: `#${m.categoryId}\n\n${m.description}`,
			frame: m.frame - timelineStartFrame,
			color: MarkerColor.Blue,
			customData: JSON.stringify({
				__postpin: true,
				id: m.id,
			} satisfies CustomData),
		}));
		await MainAPI!.setMarkers!(mappedMarkers);
	}

	async function test() {
		const result = await MainAPI!.test!();
		console.log("Test result:", result);
	}

	async function deleteMarkers() {
		await MainAPI!.clearMarkers!();
	}
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="text-2xl font-bold">PostPin Integration</h1>

	<select bind:value={timelineId} class="select">
		{#each projectsWithTimelines as project}
			<optgroup
				label={`${project.name}${project.nleProjectId ? ` (${project.nleProjectId})${project.nleProjectId === nleProjectId ? " - Current" : ""}` : ""}`}
			>
				{#each project.timelines as timeline}
					<option value={timeline.id}>
						{timeline.name}
						{#if timeline.nleTimelineId}
							({timeline.nleTimelineId})
							{#if timeline.nleTimelineId === nleTimelineId}
								- Current
							{/if}
						{/if}
					</option>
				{/each}
			</optgroup>
		{:else}
			<option disabled>No timelines found</option>
		{/each}
	</select>

	{#if projectId && timelineId}
		<select bind:value={exportId} class="select">
			{#each (await getExports( { client, path: { projectId, timelineId } } )).data!.exports as timelineExport}
				<option value={timelineExport.id}>{timelineExport.createdAt}</option>
			{:else}
				<option disabled>No exports found</option>
			{/each}
		</select>
	{/if}

	<label class="label">
		<span class="label-text">Additionally render to Disk</span>
		<input type="checkbox" bind:checked={renderSecond} class="toggle toggle-primary" />
	</label>

	{#if renderSecond}
		<select bind:value={renderPreset} class="select">
			{#each await MainAPI!.getRenderPresets!() as preset}
				<option value={preset}>{preset}</option>
			{/each}
		</select>

		<div>
			<input
				type="text"
				bind:value={renderSecondPath}
				placeholder="Enter render path"
				class="input input-bordered w-full max-w-xs"
			/>
			<button
				onclick={async () => (renderSecondPath = await MainAPI!.pickOutputDirectory!())}
				class="btn btn-secondary ml-2">Pick Directory</button
			>
		</div>

		<input
			type="text"
			bind:value={renderSecondName}
			placeholder="Enter render filename"
			class="input input-bordered w-full max-w-xs"
		/>
	{/if}

	<button
		onclick={renderAndUpload}
		disabled={timelineId === null || isBusy}
		class="btn btn-primary"
	>
		Render & Upload
	</button>

	{#if timelineId && exportId}
		<div class="flex justify-between gap-2">
			<button onclick={syncMarkersUp} disabled={isBusy} class="btn btn-secondary">
				Sync Markers Up
			</button>
			<button onclick={syncMarkersDown} disabled={isBusy} class="btn btn-secondary">
				Sync Markers Down
			</button>
			<button onclick={deleteMarkers} disabled={isBusy} class="btn btn-error">
				Delete All Markers
			</button>
		</div>
	{/if}
	<button onclick={test} disabled={isBusy} class="btn btn-secondary"> Test </button>

	{#if isBusy && renderProgress && renderProgress.percent < 100}
		<div class="flex items-center gap-2">
			<!-- Resolve stays at 0% while it prepares the render, so show an indeterminate bar until then -->
			{#if renderProgress.percent > 0}
				<progress class="progress progress-primary" value={renderProgress.percent} max="100"
				></progress>
			{:else}
				<progress class="progress progress-primary"></progress>
			{/if}
			<span class="text-sm whitespace-nowrap tabular-nums">
				{renderProgress.percent > 0 ? `${Math.round(renderProgress.percent)}%` : "Preparing…"}
				{#if renderProgress.estimatedTimeRemainingMs > 0}
					· {formatDuration(renderProgress.estimatedTimeRemainingMs)} left
				{/if}
			</span>
		</div>
	{/if}

	{#if isBusy && uploadProgress && uploadProgress.uploadedBytes < uploadProgress.totalBytes}
		<div class="flex items-center gap-2">
			<progress
				class="progress progress-primary"
				value={uploadProgress.uploadedBytes}
				max={uploadProgress.totalBytes}
			></progress>
			<span class="text-sm whitespace-nowrap tabular-nums">
				{Math.floor((uploadProgress.uploadedBytes / uploadProgress.totalBytes) * 100)}% ·
				{formatMegabytes(uploadProgress.uploadedBytes)} / {formatMegabytes(
					uploadProgress.totalBytes,
				)}
			</span>
		</div>
	{/if}

	<pre>{log.join("\n")}</pre>

	{#if error}
		<div role="alert" class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<button class="btn btn-link" onclick={() => MainAPI!.logout!()}>Logout</button>
</main>
