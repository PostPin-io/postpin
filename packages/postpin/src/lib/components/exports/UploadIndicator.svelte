<script lang="ts">
	// Running uploads, on every page of the app: they go on while the user looks around
	import { page } from "$app/state";
	import ImageUp from "@lucide/svelte/icons/cloud-upload";
	import { uploads } from "#lib/upload/uploads.svelte.ts";

	const exportsUrl = (u: { projectId: string; timelineId: string }) =>
		`/projects/${u.projectId}/timelines/${u.timelineId}/exports`;
	// the export list of that timeline shows the progress itself
	const shown = $derived(uploads.running.filter((u) => page.url.pathname !== exportsUrl(u)));
</script>

{#if shown.length > 0}
	<div
		class="fixed right-4 bottom-4 z-40 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2"
		role="status"
		aria-live="polite"
	>
		{#each shown as upload (upload.exportId)}
			{@const percent = Math.floor((upload.loaded / Math.max(1, upload.size)) * 100)}
			<a
				href={exportsUrl(upload)}
				class="rounded-box border border-base-300 bg-base-100 p-3 text-sm shadow-lg hover:bg-base-200"
			>
				<div class="flex items-center gap-2">
					<ImageUp size={16} class="shrink-0 text-primary" />
					<span class="min-w-0 flex-1 truncate font-medium" title={upload.name}>{upload.name}</span>
					<span class="text-base-content/70 tabular-nums">
						{upload.status === "completing" ? "…" : `${percent} %`}
					</span>
				</div>
				<progress class="progress mt-2 w-full progress-primary" value={percent} max="100"
				></progress>
			</a>
		{/each}
	</div>
{/if}
