<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { getTimelines } from "./timeline.remote.ts";
	import { getUrl } from "#lib/components/review/export-view.remote.ts";
	import NewTimelineModal from "#lib/components/timelines/NewTimelineModal.svelte";
	import RenameTimelineModal from "#lib/components/timelines/RenameTimelineModal.svelte";
	import DeleteTimelineModal from "#lib/components/timelines/DeleteTimelineModal.svelte";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import UploadDropOverlay from "#lib/components/exports/UploadDropOverlay.svelte";
	import { heldUpload } from "#lib/upload/held-upload.svelte.ts";
	import Upload from "@lucide/svelte/icons/upload";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import FileDown from "@lucide/svelte/icons/file-down";
	import List from "@lucide/svelte/icons/list";
	import Link from "@lucide/svelte/icons/link";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Trash from "@lucide/svelte/icons/trash";
	import Plus from "@lucide/svelte/icons/plus";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import Apeture from "@lucide/svelte/icons/aperture";

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

	let delTimelineDialog: DeleteTimelineModal | null = null;
	let renameTimelineDialog: RenameTimelineModal | null = null;
	let timelineDialog: NewTimelineModal | null = null;
	let sharingDialog: SharingSetupModal | null = null;

	let data = $derived(await getTimelines(page.params.project || ""));

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}

	// A video dropped here waits for its timeline: those it may go to stand out, the others fade
	const canDropHere = $derived(data.timelines.some((t) => t.canUpload));
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

	function exportLinks(timeline: (typeof data.timelines)[number]) {
		const latest = timeline.exports[0];
		const base = `/projects/${page.params.project}/timelines/${timeline.id}/exports`;
		// with a held video the timeline is its target: the export list takes the video
		const uploadHere = !!heldUpload.file && timeline.canUpload;
		return {
			latest,
			// A timeline opens its export list; the latest export is only a shortcut next to it
			exportHref: latest && !uploadHere ? `${base}/${latest.id}` : null,
			exportListHref: base,
			uploadHere,
		};
	}

	function closeMenu(timeline: (typeof data.timelines)[number]) {
		document.getElementById(`timeline-menu-${timeline.id}`)?.hidePopover();
	}

	function renameTimeline(timeline: (typeof data.timelines)[number]) {
		closeMenu(timeline);
		renameTimelineDialog?.open(timeline);
	}

	function openInvitations(timeline: (typeof data.timelines)[number]) {
		closeMenu(timeline);
		sharingDialog?.open({ projectId: page.params.project!, timelineId: timeline.id });
	}

	function shareLatestExport(timeline: (typeof data.timelines)[number], exportId: string) {
		closeMenu(timeline);
		sharingDialog?.open({
			projectId: page.params.project!,
			timelineId: timeline.id,
			exportId,
		});
	}

	function deleteTimeline(timeline: (typeof data.timelines)[number]) {
		closeMenu(timeline);
		delTimelineDialog?.open(timeline);
	}

	onMount(() => {
		const storedMode = localStorage.getItem("TimelinesView");
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
		localStorage.setItem("TimelinesView", viewMode);
	});
	$effect(() => {
		localStorage.setItem("SortFieldStatus", sortField);
	});
	$effect(() => {
		localStorage.setItem("SortDirectionStatus", sortDirection);
	});
</script>

<PageMeta title="{data.projectName} timelines" description="The timelines of {data.projectName}." />

{#snippet actionsMenu(
	timeline: (typeof data.timelines)[number],
	exportHref: string | null,
	exportListHref: string,
)}
	<button
		type="button"
		class="btn badge shrink-0 badge-ghost"
		aria-label="Timeline actions"
		popovertarget="timeline-menu-{timeline.id}"
		style="anchor-name: --timeline-anchor-{timeline.id}"
	>
		<Ellipsis />
	</button>

	<ul
		id="timeline-menu-{timeline.id}"
		popover
		class="menu dropdown dropdown-end z-50 w-56 rounded-box bg-base-100 p-2 text-left shadow-lg"
		style="position-anchor: --timeline-anchor-{timeline.id}"
	>
		<li>
			<a href={exportListHref}>
				<List class="size-4" />
				Open timeline
			</a>
		</li>
		{#if exportHref}
			<li>
				<a href={exportHref}>
					<FileDown class="size-4" />
					Open latest export
				</a>
			</li>
		{:else}
			<li class="menu-disabled"><span>No exports yet</span></li>
		{/if}

		{#if timeline.canShare}
			<li class="mt-1 border-t border-base-300 pt-1">
				<button type="button" onclick={() => openInvitations(timeline)}>
					<UserGroup class="size-4" />
					Invitations
				</button>
			</li>
		{/if}

		{#if timeline.canShareLink && timeline.exports[0]}
			<li class={timeline.canShare ? "" : "mt-1 border-t border-base-300 pt-1"}>
				<button type="button" onclick={() => shareLatestExport(timeline, timeline.exports[0].id)}>
					<Link class="size-4" />
					Share links of latest export
				</button>
			</li>
		{/if}

		{#if timeline.canRename}
			<li class="mt-1 border-t border-base-300 pt-1">
				<button type="button" onclick={() => renameTimeline(timeline)}>
					<Pencil class="size-4" />
					Rename timeline
				</button>
			</li>
		{/if}

		{#if timeline.canDelete}
			<li class={timeline.canRename ? "" : "mt-1 border-t border-base-300 pt-1"}>
				<button type="button" class="text-error" onclick={() => deleteTimeline(timeline)}>
					<Trash class="size-4" />
					Delete timeline
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
	{#if loadingStatus}
		<div class="flex flex-1 items-center justify-center" role="status" aria-live="polite">
			<div
				class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 text-center shadow-lg"
			>
				<span class="loading loading-lg loading-spinner text-primary" aria-hidden="true"></span>
				<div>
					<p class="text-lg font-semibold">Loading your timelines</p>
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
				<h1 class="text-2xl font-bold">Your Timelines</h1>
				{#if data.canCreate}
					<button
						class="btn rounded-full btn-sm"
						aria-label="New timeline"
						data-guide="navigation/new-timeline"
						onclick={() => timelineDialog?.open()}
					>
						<Plus />
					</button>
				{/if}
			</div>

			<div class="flex flex-wrap items-baseline gap-3 max-md:w-full">
				<div class="flex flex-wrap items-center gap-2 max-md:flex-1">
					<input
						type="search"
						placeholder="Search timelines"
						aria-label="Search timelines"
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
		{@const emptyMessage = query ? "No timelines match your search." : "No timelines yet."}
		{@const sortedTimelines = data.timelines
			.filter((item) => item.name.toLowerCase().includes(query))
			.sort((a, b) => {
				const comparison =
					sortField === "name"
						? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
						: sortField === "created"
							? a.createdAt.getTime() - b.createdAt.getTime()
							: a.updatedAt.getTime() - b.updatedAt.getTime();

				return (sortDirection == "asc" ? 1 : -1) * comparison || a.id.localeCompare(b.id);
			})}

		<!-- the tour opens a timeline that has an export -->
		{@const leadsOn = sortedTimelines.find((t) => t.exports.length > 0)?.id}

		{#if shownView === "table"}
			<div
				class="overflow-x-auto rounded-box border border-base-content/10 bg-base-100 shadow"
				data-guide="navigation/timelines"
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
						{#each sortedTimelines as timeline (timeline.id)}
							{@const { latest, exportHref, exportListHref, uploadHere } = exportLinks(timeline)}
							<tr class="group/target [&>td]:align-middle {targetClass(timeline.canUpload, true)}">
								<td class="w-44">
									<div class="aspect-video w-36 overflow-hidden rounded-md bg-base-300">
										{#if latest?.media}
											<a
												href={exportListHref}
												class="group relative block size-full"
												aria-label={uploadHere ? "Upload here" : `Exports of ${timeline.name}`}
											>
												<img
													src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
													alt="Thumbnail of {timeline.name}"
													loading="lazy"
													class="size-full object-cover transition duration-300 group-hover:scale-105"
												/>
											</a>
										{:else}
											<a
												href={exportListHref}
												aria-label={uploadHere ? "Upload here" : `Exports of ${timeline.name}`}
												class="flex size-full items-center justify-center text-base-content/30"
											>
												<Apeture />
											</a>
										{/if}
									</div>
								</td>

								<td class="font-medium">
									<a
										href={exportListHref}
										class="link link-hover"
										data-guide={timeline.id === leadsOn ? "navigation/open-timeline" : undefined}
										>{timeline.name}</a
									>
								</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(timeline.createdAt).toLocaleDateString()}
								</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(timeline.updatedAt).toLocaleDateString()}
								</td>

								<td class="text-right whitespace-nowrap">
									<div class="flex items-center justify-end gap-2">
										{#if uploadHere}
											<a
												href={exportListHref}
												class="btn btn-sm btn-warning group-hover/target:btn-success"
											>
												<Upload size={16} /> Upload here
											</a>
										{:else}
											{#if exportHref}
												<a href={exportHref} class="btn btn-ghost btn-sm">Open latest</a>
											{/if}
											<a href={exportListHref} class="btn btn-primary btn-sm">Open</a>
										{/if}
										{@render actionsMenu(timeline, exportHref, exportListHref)}
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
				data-guide="navigation/timelines"
			>
				{#each sortedTimelines as timeline (timeline.id)}
					{@const { latest, exportHref, exportListHref, uploadHere } = exportLinks(timeline)}
					<article
						class="group/target card h-full bg-base-100 shadow-xl transition {targetClass(
							timeline.canUpload,
						)}"
					>
						<figure class="group relative aspect-video overflow-hidden bg-base-300">
							{#if latest?.media}
								<a
									href={exportListHref}
									class="block size-full"
									aria-label={uploadHere ? "Upload here" : `Exports of ${timeline.name}`}
								>
									<img
										src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
										alt="Thumbnail of {timeline.name}"
										loading="lazy"
										class="size-full object-cover transition duration-300 group-hover:scale-105"
									/>
								</a>
							{:else}
								<a
									href={exportListHref}
									aria-label={uploadHere ? "Upload here" : `Exports of ${timeline.name}`}
									class="flex size-full items-center justify-center text-base-content/30"
								>
									<Apeture />
								</a>
							{/if}
						</figure>

						<div class="card-body">
							<h2 class="card-title flex items-center justify-between gap-2">
								<a
									href={exportListHref}
									class="min-w-0 flex-1 link truncate link-hover"
									data-guide={timeline.id === leadsOn ? "navigation/open-timeline" : undefined}
									title={timeline.name}
								>
									{timeline.name}
								</a>
								{@render actionsMenu(timeline, exportHref, exportListHref)}
							</h2>

							<dl class="space-y-1 text-sm text-base-content/70">
								<div class="flex justify-between gap-4">
									<dt>Created</dt>
									<dd>{new Date(timeline.createdAt).toLocaleDateString()}</dd>
								</div>
								<div class="flex justify-between gap-4">
									<dt>Last updated</dt>
									<dd>{new Date(timeline.updatedAt).toLocaleDateString()}</dd>
								</div>
							</dl>

							<div class="mt-4 card-actions items-center justify-end">
								{#if uploadHere}
									<a
										href={exportListHref}
										class="btn btn-sm btn-warning group-hover/target:btn-success"
									>
										<Upload size={16} /> Upload here
									</a>
								{:else}
									{#if exportHref}
										<a href={exportHref} class="btn btn-ghost btn-sm">Open latest</a>
									{:else}
										<span class="me-auto text-sm text-base-content/70">No exports yet</span>
									{/if}
									<a href={exportListHref} class="btn btn-primary btn-sm">Open</a>
								{/if}
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

<NewTimelineModal bind:this={timelineDialog} projectId={page.params.project!} />
<RenameTimelineModal bind:this={renameTimelineDialog} projectId={page.params.project!} />
<DeleteTimelineModal bind:this={delTimelineDialog} />
<SharingSetupModal bind:this={sharingDialog} />
{#if canDropHere}
	<UploadDropOverlay ondropped={(file) => heldUpload.hold(file)}>
		Then choose the timeline it goes to.
	</UploadDropOverlay>
{/if}
