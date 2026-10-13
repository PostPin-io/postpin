<script>
	import { page } from "$app/state";
	import { getTimelines } from "./timeline.remote.ts";
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-4">
	<h1 class="text-2xl font-bold">Your Timelines</h1>

	{#each await getTimelines(page.params.project || "") as timeline (timeline.id)}
		<div class="card w-250 bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">{timeline.name}</h2>
				{"last updated: " + new Date(timeline.updatedAt).toLocaleDateString()}
				{"created at: " + new Date(timeline.createdAt).toLocaleDateString()}
				<div class="card-actions justify-end">
					<a href={`/projects/project-${timeline.id}`} class="btn btn-primary">Open latest export</a
					>
				</div>
			</div>
		</div>
	{/each}
</div>
