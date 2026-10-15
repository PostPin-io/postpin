<script lang="ts">
	import { getProjects } from "./project.remote.ts";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";

	let viewMode: "table" | "card" = $state("card");
	let sortField: "name" | "created" | "updated" = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}
</script>

<div class="flex h-full w-full flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-2xl font-bold">Your Projects</h1>
		<div>
			<button
				class="btn join-item btn-sm"
				class:btn-active={viewMode === "table"}
				onclick={() => (viewMode = "table")}>Table</button
			>
			<button
				class="btn join-item btn-sm"
				class:btn-active={viewMode === "card"}
				onclick={() => (viewMode = "card")}>Cards</button
			>
		</div>
	</div>

	{#await getProjects()}
		<p class="text-base-content/70">Loading projects...</p>
	{:then projects}
		{#if viewMode === "table"}
			<div class="overflow-x-auto rounded-box bg-base-100 shadow">
				<table class="table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Created</th>
							<th>Last updated</th>
							<th><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each projects as project (project.id)}
							<tr>
								<td class="font-medium">{project.name}</td>
								<td>{new Date(project.createdAt).toLocaleDateString()}</td>
								<td>{new Date(project.updatedAt).toLocaleDateString()}</td>
								<td class="text-right">
									<a href={`/projects/${project.id}`} class="btn btn-primary btn-sm"
										>View Timelines</a
									>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="py-8 text-center text-base-content/70">No projects yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each projects as project (project.id)}
					<article class="card h-full bg-base-100 shadow-xl">
						<div class="card-body">
							<h2 class="card-title">{project.name}</h2>

							<dl class="space-y-1 text-sm text-base-content/70">
								<div class="flex justify-between gap-4">
									<dt>Created</dt>
									<dd>{new Date(project.createdAt).toLocaleDateString()}</dd>
								</div>
								<div class="flex justify-between gap-4">
									<dt>Last updated</dt>
									<dd>{new Date(project.updatedAt).toLocaleDateString()}</dd>
								</div>
							</dl>

							<div class="mt-4 card-actions justify-end">
								<a href={`/projects/${project.id}`} class="btn btn-primary">View Timelines</a>
							</div>
						</div>
					</article>
				{:else}
					<p class="text-base-content/70">No projects yet.</p>
				{/each}
			</div>
		{/if}
	{/await}
</div>
