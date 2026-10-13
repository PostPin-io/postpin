<script>
	import { getProjects } from "./project.remote.ts";
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-4">
	<h1 class="text-2xl font-bold">Your Projects</h1>

	{#each await getProjects() as project (project.id)}
		<div class="card w-250 bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">{project.name}</h2>
				{"last updated: " + new Date(project.updatedAt).toLocaleDateString()}
				{"created at: " + new Date(project.createdAt).toLocaleDateString()}

				<div class="card-actions justify-end">
					<a href={`/projects/${project.id}`} class="btn btn-primary">View Timelines</a>
				</div>
			</div>
		</div>
	{/each}
</div>
