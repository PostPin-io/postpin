<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { onMount } from "svelte";
	import { getProjects } from "./project.remote.ts";
	import { getMemberships } from "../profile/profile.remote.ts";
	import { getUrl } from "#lib/components/review/export-view.remote.ts";
	import NewProjectModal from "#lib/components/projects/NewProjectModal.svelte";
	import RenameProjectModal from "#lib/components/projects/RenameProjectModal.svelte";
	import NewOrgModal from "../../../lib/components/organizations/NewOrgModal.svelte";
	import DeleteProjectModal from "#lib/components/projects/DeleteProjectModal.svelte";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import ManageAccessModal from "#lib/components/sharing/ManageAccessModal.svelte";
	import LoadingAnimation from "#lib/components/layout/LoadingAnimation.svelte";
	import UploadDropOverlay from "#lib/components/exports/UploadDropOverlay.svelte";
	import { heldUpload } from "#lib/upload/held-upload.svelte.ts";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import Apeture from "@lucide/svelte/icons/aperture";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import ShieldUser from "@lucide/svelte/icons/shield-user";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import FolderOpen from "@lucide/svelte/icons/folder-open";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Trash from "@lucide/svelte/icons/trash";
	import Plus from "@lucide/svelte/icons/plus";
	import { MediaQuery } from "svelte/reactivity";

	let viewMode: "table" | "card" = $state("card");
	// Tables don't fit on phones: show cards there, but keep the stored choice for desktop
	const isMobile = new MediaQuery("max-width: 767px");
	const shownView = $derived.by(() => (isMobile.current ? "card" : viewMode));

	type SortField = "name" | "created" | "updated";
	const sortFields: { value: SortField; label: string }[] = [
		{ value: "name", label: "Name" },
		{ value: "created", label: "Created" },
		{ value: "updated", label: "Updated" },
	];
	let sortField: SortField = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");
	let searchQuery = $state("");
	let loadingStatus = $state(true);

	let dialog: NewOrgModal | null = null;
	let projectDialog: NewProjectModal | null = null;
	let renameProjectDialog: RenameProjectModal | null = null;
	let delProjectDialog: DeleteProjectModal | null = null;
	let inviteDialog: SharingSetupModal | null = null;
	let accessDialog: ManageAccessModal | null = null;

	let data = $derived(await getProjects());

	// A video dropped here waits for its project: those it may go to stand out, the others fade
	const canDropHere = $derived(data.projects.some((p) => p.canUpload));
	// The hovered target turns green: there the video goes
	const targetClass = (canUpload: boolean, row = false) =>
		!heldUpload.file
			? row
				? "hover:bg-base-200/60"
				: ""
			: !canUpload
				? "opacity-40"
				: row
					? "bg-warning/15 hover:bg-success/20"
					: "ring-2 ring-warning ring-offset-2 ring-offset-base-100 hover:ring-success";

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}

	function closeMenu(project: (typeof data.projects)[number]) {
		document.getElementById(`project-menu-${project.id}`)?.hidePopover();
	}

	function renameProject(project: (typeof data.projects)[number]) {
		closeMenu(project);
		renameProjectDialog?.open(project);
	}

	function inviteToProject(project: (typeof data.projects)[number]) {
		closeMenu(project);
		inviteDialog?.open({ projectId: project.id });
	}

	function manageProjectAccess(project: (typeof data.projects)[number]) {
		closeMenu(project);
		accessDialog?.open({ projectId: project.id });
	}

	function deleteProject(project: (typeof data.projects)[number]) {
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

<PageMeta title="Projects" description="Your PostPin projects." />

<!--
	One dropdown for all actions of a project, in the same groups as on timelines and exports:
	open, then sharing, then edit. Uses daisyUI 5's popover API: the menu lives in the browser's
	top layer, so overflow containers (table, card) don't clip it.
-->
{#snippet actionsMenu(project: (typeof data.projects)[number], projectHref: string)}
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
		{#if project.canShare}
			<li class="mt-1 border-t border-base-300 pt-1">
				<button type="button" onclick={() => inviteToProject(project)}>
					<UserGroup class="size-4" />
					Invite to project
				</button>
			</li>
			<li>
				<button type="button" onclick={() => manageProjectAccess(project)}>
					<ShieldUser class="size-4" />
					Manage access
				</button>
			</li>
		{/if}
		{#if project.canRename}
			<li class="mt-1 border-t border-base-300 pt-1">
				<button type="button" onclick={() => renameProject(project)}>
					<Pencil class="size-4" />
					Rename project
				</button>
			</li>
		{/if}
		{#if project.canDelete}
			<li class={project.canRename ? "" : "mt-1 border-t border-base-300 pt-1"}>
				<button type="button" class="text-error" onclick={() => deleteProject(project)}>
					<Trash class="size-4" />
					Delete project
				</button>
			</li>
		{/if}
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

<div class="flex h-full w-full flex-col gap-4 md:gap-6 md:p-6">
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
				<LoadingAnimation class="size-24" />
				<div>
					<p class="text-lg font-semibold">Loading your projects</p>
					<p class="mt-1 text-sm text-base-content/70">
						Please wait while we get everything ready.
					</p>
				</div>
			</div>
		</div>
	{:else}
		<header
			class="flex flex-col gap-3 border-b border-base-300 pb-4 md:flex-row md:items-center md:justify-between"
		>
			<div class="flex gap-2">
				<h1 class="text-2xl font-bold">Your Projects</h1>
				{#if data.canCreate}
					<button
						class="btn rounded-full btn-sm"
						aria-label="New project"
						data-guide="navigation/new-project"
						onclick={() => projectDialog?.open()}
					>
						<Plus />
					</button>
				{/if}
			</div>

			<div class="flex flex-wrap items-baseline gap-3 max-md:w-full">
				<div class="flex flex-wrap items-center gap-2 max-md:flex-1">
					<input
						type="search"
						placeholder="Search projects"
						aria-label="Search projects"
						data-guide="navigation/search"
						class="input input-sm max-md:w-full"
						bind:value={searchQuery}
					/>
				</div>
				<button
					type="button"
					class="flex self-center"
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
				<div class="join max-md:hidden" role="group" data-guide="navigation/views">
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

				<div
					class="dropdown dropdown-end"
					onfocusout={(event) => {
						// Collapse the submenu once focus leaves the dropdown
						const next = event.relatedTarget as Node | null;
						if (next && event.currentTarget.contains(next)) return;
						event.currentTarget.querySelectorAll("details").forEach((d) => (d.open = false));
					}}
				>
					<div
						tabindex="0"
						role="button"
						class="btn btn-circle btn-ghost"
						aria-label="Sort options"
						data-guide="navigation/sort"
					>
						<Ellipsis class="h-6 w-6" />
					</div>
					<ul
						tabindex="-1"
						class="menu dropdown-content z-10 w-52 rounded-box bg-base-100 p-2 shadow-sm"
					>
						<li>
							<details>
								<summary>Sort by</summary>
								<ul>
									{#each sortFields as field (field.value)}
										<li>
											<a
												class={sortField === field.value ? "menu-active" : ""}
												onclick={() => (sortField = field.value)}>{field.label}</a
											>
										</li>
									{/each}
								</ul>
							</details>
						</li>
					</ul>
				</div>
			</div>
		</header>

		{@const query = searchQuery.trim().toLowerCase()}
		{@const emptyMessage = query ? "No projects match your search." : "No projects yet."}
		{@const sortedProjects = data.projects
			.filter((project) => project.name.toLowerCase().includes(query))
			.sort((a, b) => {
				const comparison =
					sortField === "name"
						? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
						: sortField === "created"
							? a.createdAt.getTime() - b.createdAt.getTime()
							: a.updatedAt.getTime() - b.updatedAt.getTime();

				return (sortDirection == "asc" ? 1 : -1) * comparison || a.id.localeCompare(b.id);
			})}

		<!-- the tour opens a project that leads on to an export -->
		{@const leadsOn = sortedProjects.find((p) => p.timelines.some((t) => t.exports.length > 0))?.id}

		{#if shownView === "table"}
			<div
				class="overflow-x-auto rounded-box border border-base-content/10 bg-base-100 shadow"
				data-guide="navigation/projects"
			>
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

							<tr class="[&>td]:align-middle {targetClass(project.canUpload, true)}">
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
											<a
												href={projectHref}
												aria-label="Open {project.name}"
												class="flex size-full items-center justify-center text-base-content/30"
											>
												<Apeture />
											</a>
										{/if}
									</div>
								</td>

								<td class="font-medium">
									<a
										href={projectHref}
										class="link link-hover"
										data-guide={project.id === leadsOn ? "navigation/open-project" : undefined}
										>{project.name}</a
									>
								</td>
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
								<td colspan="5" class="py-8 text-center text-base-content/70">{emptyMessage}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div
				class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
				data-guide="navigation/projects"
			>
				{#each sortedProjects as project (project.id)}
					{@const latest = project.timelines[0]?.exports[0]}
					{@const projectHref = `/projects/${project.id}`}

					<article
						class="card h-full bg-base-100 shadow-xl transition {targetClass(project.canUpload)}"
					>
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
								<a
									href={projectHref}
									aria-label="Open {project.name}"
									class="flex size-full items-center justify-center text-base-content/30"
								>
									<Apeture />
								</a>
							{/if}
						</figure>

						<div class="card-body">
							<h2 class="card-title flex items-center justify-between gap-2">
								<a
									href={projectHref}
									class="min-w-0 flex-1 link truncate link-hover"
									data-guide={project.id === leadsOn ? "navigation/open-project" : undefined}
									title={project.name}
								>
									{project.name}
								</a>
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
								<a href={projectHref} class="btn btn-primary btn-sm">Open</a>
							</div>
						</div>
					</article>
				{:else}
					<p class="text-base-content/70">{emptyMessage}</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<NewOrgModal bind:this={dialog} />
<NewProjectModal bind:this={projectDialog} />
<RenameProjectModal bind:this={renameProjectDialog} />
<DeleteProjectModal bind:this={delProjectDialog} />
<SharingSetupModal bind:this={inviteDialog} />
<ManageAccessModal bind:this={accessDialog} oninvite={(t) => inviteDialog?.open(t)} />
{#if canDropHere}
	<UploadDropOverlay ondropped={(file) => heldUpload.hold(file)}>
		Then choose the project and the timeline it goes to.
	</UploadDropOverlay>
{/if}
