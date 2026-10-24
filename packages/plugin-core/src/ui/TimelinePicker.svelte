<script lang="ts">
	import type { ProjectWithTimelines } from "@postpin-io/api-client-ts";

	interface Props {
		projects: ProjectWithTimelines[];
		// ids of the project and timeline open in the NLE, marked as "Current"
		nleProjectId: string;
		nleTimelineId: string;
		timelineId: string | null;
	}

	let { projects, nleProjectId, nleTimelineId, timelineId = $bindable() }: Props = $props();
</script>

<select bind:value={timelineId} class="select">
	{#each projects as project}
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
