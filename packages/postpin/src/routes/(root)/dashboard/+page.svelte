<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { getProjects } from "./project.remote.ts";
	import { getMemberships } from "../profile/profile.remote.ts";
	import { getUrl } from "../videotests/videotests.remote.ts";
	import NewProjectModal from "#lib/components/NewProjectModal.svelte";
	import RenameProjectModal from "#lib/components/RenameProjectModal.svelte";
	import NewOrgModal from "../../../lib/components/NewOrgModal.svelte";
	import DeleteProjectModal from "#lib/components/DeleteProjectModal.svelte";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import Apeture from "@lucide/svelte/icons/aperture";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import FolderOpen from "@lucide/svelte/icons/folder-open";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Trash from "@lucide/svelte/icons/trash";
	import Plus from "@lucide/svelte/icons/plus";

	let viewMode: "table" | "card" = $state("card");
	let sortField: "name" | "created" | "updated" = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");
	let loadingStatus = $state(true);

	let dialog: NewOrgModal | null = null;
	let projectDialog: NewProjectModal | null = null;
	let renameProjectDialog: RenameProjectModal | null = null;
	let delProjectDialog: DeleteProjectModal | null = null;

	let projects = $derived(await getProjects());

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}

	function closeMenu(project: (typeof projects)[number]) {
		document.getElementById(`project-menu-${project.id}`)?.hidePopover();
	}

	function renameProject(project: (typeof projects)[number]) {
		closeMenu(project);
		renameProjectDialog?.open(project);
	}

	function deleteProject(project: (typeof projects)[number]) {
		closeMenu(project);
		delProjectDialog?.open(project);
	}

	onMount(() => {
		const storedMode = localStorage.getItem("ProjectsView");
		const storedFieldStatus = localStorage.getItem("SortFieldStatus");
		const storedDirectionStatus = localStorage.getItem("SortDirectionStatus");

		viewMode = storedMode == "table" ? "table" : "card";
		sortDirection = storedDirectionStatus == "desc" ? "desc" : "asc";
		if (
			storedFieldStatus == "name" ||
			storedFieldStatus == "updated" ||
			storedFieldStatus == "created"
		) {
			sortField = storedFieldStatus;
		}
		loadingStatus = false;
	});

	$effect(() => {
		localStorage.setItem("ProjectsView", viewMode);
	});
	$effect(() => {
		localStorage.setItem("SortFieldStatus", sortField);
	});
	$effect(() => {
		localStorage.setItem("SortDirectionStatus", sortDirection);
	});
</script>

<!--
	Ein Dropdown für alle Aktionen eines Projekts (Öffnen, Umbenennen, Löschen).
	Nutzt das Popover-API von daisyUI 5: Das Menü liegt im Top-Layer des Browsers
	und wird deshalb nicht von overflow-Containern (Tabelle, Card) abgeschnitten.
-->
{#snippet actionsMenu(project: (typeof projects)[number], projectHref: string)}
	<button
		type="button"
		class="btn badge shrink-0 badge-ghost"
		aria-label="Project actions"
		popovertarget="project-menu-{project.id}"
		style="anchor-name: --project-anchor-{project.id}"
	>
		<Ellipsis />
	</button>

	<ul
		id="project-menu-{project.id}"
		popover
		class="menu dropdown dropdown-end z-50 w-56 rounded-box bg-base-100 p-2 text-left shadow-lg"
		style="position-anchor: --project-anchor-{project.id}"
	>
		<li>
			<a href={projectHref}>
				<FolderOpen class="size-4" />
				Open project
			</a>
		</li>
		<li>
			<button type="button" onclick={() => renameProject(project)}>
				<Pencil class="size-4" />
				Rename project
			</button>
		</li>

		<li class="mt-1 border-t border-base-300 pt-1">
			<button type="button" class="text-error" onclick={() => deleteProject(project)}>
				<Trash class="size-4" />
				Delete project
			</button>
		</li>
	</ul>
{/snippet}

{#snippet chevronToggle(field: typeof sortField)}
	{#if sortField == field}
		{#if sortDirection == "asc"}
			<ChevronUp size={15} />
		{:else}
			<ChevronDown size={15} />
		{/if}
	{/if}
{/snippet}

<div class="flex h-full w-full flex-col gap-6 p-6">
	{#if (await getMemberships()).length == 0}
		<div class="flex min-h-[70vh] items-center justify-center p-6">
			<div class="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl">
				<div class="card-body items-center text-center">
					<div
						class="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<UserGroup />
					</div>

					<h1 class="card-title text-3xl font-bold">Welcome! <br /></h1>
					<h2 class="card-title text-2xl">Let's get you set up</h2>
					<p class="text-base-content/70">
						Create your first organization to start collaborating with your team. You can invite
						members and change settings anytime.
					</p>

					<div class="mt-6 card-actions w-full">
						<button class="btn btn-block btn-primary" onclick={() => dialog?.open()}>
							Create organization
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else if loadingStatus}
		<div class="flex flex-1 items-center justify-center" role="status" aria-live="polite">
			<div
				class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 text-center shadow-lg"
			>
				<span class="loading loading-lg loading-spinner text-primary" aria-hidden="true"></span>
				<div>
					<p class="text-lg font-semibold">Loading your projects</p>
					<p class="mt-1 text-sm text-base-content/70">
						Please wait while we get everything ready.
					</p>
				</div>
			</div>
		</div>
	{:else}
		<header class="flex justify-between border-b border-base-300 pb-4">
			<div class="flex gap-2">
				<h1 class="text-2xl font-bold">Your Projects</h1>
				<button
					class="btn rounded-full btn-sm"
					aria-label="New project"
					onclick={() => projectDialog?.open()}
				>
					<Plus />
				</button>
			</div>

			<div class="flex flex-wrap items-baseline gap-3">
				<div class="flex flex-wrap items-center gap-2">
					{#if viewMode == "card"}
						<label class="text-sm font-medium" for="project-sort">Sort by</label>
						<select id="project-sort" class="select-bordered select w-56" bind:value={sortField}>
							<option value="name">Name</option>
							<option value="created">Created</option>
							<option value="updated">Updated</option>
						</select>

						<button
							type="button"
							aria-label="Toggle sort direction"
							onclick={() => {
								sortDirection = sortDirection == "asc" ? "desc" : "asc";
							}}
						>
							{#if sortDirection == "asc"}
								<ChevronUp />
							{:else}
								<ChevronDown />
							{/if}
						</button>
					{/if}
				</div>

				<div class="join" role="group">
					<button
						class="btn join-item btn-sm"
						class:btn-active={viewMode === "table"}
						aria-pressed={viewMode === "table"}
						onclick={() => (viewMode = "table")}>Table</button
					>
					<button
						class="btn join-item btn-sm"
						class:btn-active={viewMode === "card"}
						aria-pressed={viewMode === "card"}
						onclick={() => (viewMode = "card")}>Cards</button
					>
				</div>
			</div>
		</header>

		{@const sortedProjects = [...projects].sort((a, b) => {
			const comparison =
				sortField === "name"
					? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
					: sortField === "created"
						? a.createdAt.getTime() - b.createdAt.getTime()
						: a.updatedAt.getTime() - b.updatedAt.getTime();

			return (sortDirection == "asc" ? 1 : -1) * comparison || a.id.localeCompare(b.id);
		})}

		{#if viewMode === "table"}
			<div class="overflow-x-auto rounded-box border border-base-content/10 bg-base-100 shadow">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th class="w-44"><span class="sr-only">Thumbnail</span></th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("name")}
								>
									Name {@render chevronToggle("name")}
								</button>
							</th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("created")}
								>
									Created {@render chevronToggle("created")}
								</button>
							</th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("updated")}
								>
									Updated {@render chevronToggle("updated")}
								</button>
							</th>
							<th><span class="sr-only">Actions</span></th>
						</tr>
					</thead>

					<tbody>
						{#each sortedProjects as project (project.id)}
							{@const latest = project.timelines[0]?.exports[0]}
							{@const projectHref = `/projects/${project.id}`}

							<tr class="hover:bg-base-200/60 [&>td]:align-middle">
								<td class="w-44">
									<div class="aspect-video w-36 overflow-hidden rounded-md bg-base-300">
										{#if latest?.media}
											<a
												href={projectHref}
												class="group relative block size-full"
												aria-label="Open {project.name}"
											>
												<img
													src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
													alt="Thumbnail of {project.name}"
													loading="lazy"
													class="size-full object-cover transition duration-300 group-hover:scale-105"
												/>
											</a>
										{:else}
											<div class="flex size-full items-center justify-center text-base-content/30">
												<Apeture />
											</div>
										{/if}
									</div>
								</td>

								<td class="font-medium">{project.name}</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(project.createdAt).toLocaleDateString()}
								</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(project.updatedAt).toLocaleDateString()}
								</td>

								<td class="text-right whitespace-nowrap">
									<div class="flex items-center justify-end gap-2">
										<a href={projectHref} class="btn btn-primary btn-sm">Open</a>
										{@render actionsMenu(project, projectHref)}
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="py-8 text-center text-base-content/70">No projects yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each sortedProjects as project (project.id)}
					{@const latest = project.timelines[0]?.exports[0]}
					{@const projectHref = `/projects/${project.id}`}

					<article class="card h-full bg-base-100 shadow-xl">
						<figure class="group relative aspect-video overflow-hidden bg-base-300">
							{#if latest?.media}
								<a href={projectHref} class="block size-full" aria-label="Open {project.name}">
									<img
										src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
										alt="Thumbnail of {project.name}"
										loading="lazy"
										class="size-full object-cover transition duration-300 group-hover:scale-105"
									/>
								</a>
							{:else}
								<div class="flex size-full items-center justify-center text-base-content/30">
									<Apeture />
								</div>
							{/if}
						</figure>

						<div class="card-body">
							<h2 class="card-title flex items-center justify-between">
								<span class="min-w-0 flex-1 truncate" title={project.name}>
									{project.name}
								</span>
								{@render actionsMenu(project, projectHref)}
							</h2>

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

							<div class="mt-4 card-actions items-center justify-end">
								<a href={projectHref} class="btn btn-primary">Open</a>
							</div>
						</div>
					</article>
				{:else}
					<p class="text-base-content/70">No projects yet.</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<NewOrgModal bind:this={dialog} />
<NewProjectModal bind:this={projectDialog} />
<RenameProjectModal bind:this={renameProjectDialog} />
<DeleteProjectModal bind:this={delProjectDialog} />
