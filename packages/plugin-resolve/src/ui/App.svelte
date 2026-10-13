<script lang="ts">
	import {
		getProjects,
		getProject,
		createExport,
		initUpload,
		completeUpload,
	} from "@postpin-io/api-client-ts";
	import { createClient } from "@postpin-io/api-client-ts/client";
	import { Settings } from "../ipc/renderer/PostPinResolveAPI";

	const client = createClient({ baseUrl: "http://localhost:5173/api" });

	let renderPreset = $state("");

	renderPreset = (await Settings!.getRenderPresets!())[0] ?? "";

	const { data: projects = [] } = await getProjects({ client });
	const projectsWithTimelines = (
		await Promise.all(
			projects.map(
				async (project) => (await getProject({ client, path: { projectId: project.id } })).data,
			),
		)
	).filter((project) => project !== undefined);

	let timelineId = $state<string | null>(null);
	// The select only yields a timeline id, so look up the project that owns it.
	const projectId = $derived(
		projectsWithTimelines.find((project) => project.timelines.some((t) => t.id === timelineId))
			?.id ?? null,
	);

	let log: string[] = $state([]);

	async function renderAndUpload() {
		if (!projectId || !timelineId) return;
		log = [];
		log.push(`Rendering timeline with preset "${renderPreset}"...`);
		const renderedPath = await Settings!.renderTimeline!("", renderPreset, "/tmp", "temp-render");
		log.push("Render complete. Creating export...");
		const exportResponse = await createExport({
			client,
			path: { projectId: projectId, timelineId: timelineId },
		});
		log.push(`Export created with ID: ${exportResponse.data!.id}. Initializing upload...`);
		const uploadUrl = await initUpload({
			client,
			path: { projectId, timelineId, exportId: exportResponse.data!.id },
		});
		log.push("Uploading...");
		await Settings!.uploadRenderedFile!(renderedPath, uploadUrl.data!.uploadUrl);
		log.push("Upload complete. Starting processing...");
		await completeUpload({
			client,
			path: { projectId, timelineId, exportId: exportResponse.data!.id },
			throwOnError: true,
		});
		log.push("Processing started, opening export in browser...");
		await Settings!.openInBrowser!(
			`/projects/${projectId}/timelines/${timelineId}/exports/${exportResponse.data!.id}`,
		);
		log.push(`Done ✅ `);
	}
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="text-2xl font-bold">PostPin Integration</h1>

	<select bind:value={timelineId} class="select">
		{#each projectsWithTimelines as project}
			<optgroup label={project.name}>
				{#each project.timelines as timeline}
					<option value={timeline.id}>{timeline.name}</option>
				{/each}
			</optgroup>
		{:else}
			<option disabled>No timelines found</option>
		{/each}
	</select>

	<select bind:value={renderPreset} class="select">
		{#each await Settings!.getRenderPresets!() as preset}
			<option value={preset}>{preset}</option>
		{/each}
	</select>

	<button onclick={renderAndUpload} disabled={timelineId === null} class="btn btn-primary"
		>Render & Upload</button
	>

	<pre>{log.join("\n")}</pre>
</main>
