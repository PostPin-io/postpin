<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { getBreadcrumbNames } from "./breadcrumbs.remote.ts";

	const projectId = $derived(page.params.project);
	const timelineId = $derived(page.params.timeline);
	const exportId = $derived(page.params.export);

	const namesQuery = $derived(
		projectId ? getBreadcrumbNames({ projectId, timelineId, exportId }) : undefined,
	);
	const names = $derived(namesQuery?.current);
</script>

{#if projectId && names}
	<div class="breadcrumbs min-w-0 text-sm">
		<ul>
			<li class="min-w-0">
				<a
					href={resolve("/(root)/projects/[project]", { project: names.project.id })}
					class="block max-w-48 truncate"
					title={names.project.name}
					aria-current={!names.timeline ? "page" : undefined}
				>
					{names.project.name}
				</a>
			</li>
			{#if names.timeline}
				<li class="min-w-0">
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
							project: names.project.id,
							timeline: names.timeline.id,
						})}
						class="block max-w-48 truncate"
						title={names.timeline.name}
						aria-current={!names.export ? "page" : undefined}
					>
						{names.timeline.name}
					</a>
				</li>
			{/if}
			{#if names.timeline && names.export}
				<li class="min-w-0">
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
							project: names.project.id,
							timeline: names.timeline.id,
							export: names.export.id,
						})}
						class="block max-w-48 truncate"
						title={names.export.name}
						aria-current="page"
					>
						{names.export.name}
					</a>
				</li>
			{/if}
		</ul>
	</div>
{/if}
